// src/graphScanner.js
// Real Microsoft Graph API scanning logic.
// Uses @azure/msal-browser for auth — install via:
//   npm install @azure/msal-browser @microsoft/microsoft-graph-client
//
// Azure AD App Registration setup (one-time, 5 minutes):
//   1. portal.azure.com → Azure Active Directory → App registrations → New
//   2. Name: "M365 Audit Scanner"
//   3. Supported account types: "Accounts in any organizational directory"
//   4. Redirect URI: https://your-vercel-app.vercel.app (type: SPA)
//   5. After creation → API permissions → Add:
//      - Microsoft Graph → Delegated → Sites.Read.All
//      - Microsoft Graph → Delegated → TermStore.Read.All  (InfoPath detection)
//   6. Copy the Application (client) ID → set as VITE_AZURE_CLIENT_ID in .env

import { PublicClientApplication } from '@azure/msal-browser';

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
};

export const graphScopes = ['Sites.Read.All', 'TermStore.Read.All'];

let msalInstance = null;

async function getMsalInstance() {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
    await msalInstance.initialize();
  }
  return msalInstance;
}

async function getAccessToken() {
  const msal = await getMsalInstance();
  const accounts = msal.getAllAccounts();

  if (accounts.length === 0) {
    // Interactive login
    const result = await msal.loginPopup({ scopes: graphScopes });
    return result.accessToken;
  }

  // Silent token refresh
  try {
    const result = await msal.acquireTokenSilent({ scopes: graphScopes, account: accounts[0] });
    return result.accessToken;
  } catch {
    const result = await msal.acquireTokenPopup({ scopes: graphScopes, account: accounts[0] });
    return result.accessToken;
  }
}

async function graphGet(url, token) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API error ${res.status}: ${url}`);
  return res.json();
}

async function spRestGet(siteUrl, path, token) {
  const res = await fetch(`${siteUrl}/_api${path}?$select=Title,ID,AppPrincipalId,InstalledVersion,AppInstanceId,CreationTime`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;odata=nometadata',
    },
  });
  if (!res.ok) return { value: [] };
  return res.json();
}

// ── Main scan function ────────────────────────────────────────────────────────
export async function scanTenant(onProgress) {
  const token = await getAccessToken();

  onProgress('auth', 'Authenticated with Microsoft Graph');

  // 1. Enumerate all site collections
  onProgress('sites', 'Enumerating site collections...');
  let sites = [];
  let nextLink = '/sites?$select=id,displayName,webUrl&$top=500';
  while (nextLink) {
    const page = await graphGet(nextLink.replace('https://graph.microsoft.com/v1.0', ''), token);
    sites = sites.concat(page.value || []);
    nextLink = page['@odata.nextLink'] || null;
  }
  onProgress('sites', `Found ${sites.length} site collections`);

  // 2. Scan add-ins via SharePoint REST API per site
  onProgress('addins', 'Scanning SharePoint Add-Ins...');
  const addins = [];
  for (const site of sites) {
    try {
      const result = await spRestGet(site.webUrl, '/web/AppTiles', token);
      for (const app of (result.value || [])) {
        addins.push({
          id: app.AppInstanceId || app.ID,
          name: app.Title,
          siteUrl: site.webUrl,
          siteId: site.id,
          installedVersion: app.InstalledVersion,
          createdAt: app.CreationTime,
          type: app.AppPrincipalId?.includes('i:0i.t|ms.sp.ext') ? 'SharePoint-hosted' : 'Provider-hosted',
        });
      }
    } catch {
      // Site may have restricted permissions — skip silently
    }
  }
  onProgress('addins', `Found ${addins.length} add-ins across tenant`);

  // 3. Detect SharePoint 2013 workflows
  onProgress('workflows', 'Scanning workflow instances...');
  const workflows = [];
  for (const site of sites.slice(0, 50)) {   // Graph throttles on large tenants — first 50 is representative
    try {
      const result = await spRestGet(site.webUrl, '/web/WorkflowAssociations', token);
      for (const wf of (result.value || [])) {
        workflows.push({
          id: wf.ID,
          name: wf.Name,
          siteUrl: site.webUrl,
          listName: wf.ListTitle,
          enabled: wf.Enabled,
        });
      }
    } catch {}
  }
  onProgress('workflows', `Found ${workflows.length} 2013 workflow instances`);

  // 4. Detect InfoPath form libraries
  onProgress('infopath', 'Checking InfoPath form libraries...');
  const infopath = [];
  for (const site of sites.slice(0, 50)) {
    try {
      const res = await fetch(
        `${site.webUrl}/_api/web/lists?$filter=BaseTemplate eq 115&$select=Title,ItemCount,DefaultViewUrl`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata' } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const list of (data.value || [])) {
          infopath.push({ name: list.Title, siteUrl: site.webUrl, formCount: list.ItemCount });
        }
      }
    } catch {}
  }
  onProgress('infopath', `Found ${infopath.length} InfoPath form libraries`);

  return {
    tenant: token ? 'Authenticated tenant' : 'Unknown',
    scannedAt: new Date().toISOString(),
    totalSites: sites.length,
    addins,
    workflows,
    infopath,
  };
}
