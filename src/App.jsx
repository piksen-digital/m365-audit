import { useState, useEffect } from "react";

// ─── Pricing (halved) ────────────────────────────────────────────────────────
const TIERS = [
  { id:"free",  name:"Free scan",     price:"$0",   period:"",          cta:"Scan free",        highlight:false,
    features:["1 tenant scan","Top-level counts only","No PDF export","No AI analysis","No workflow scan"] },
  { id:"audit", name:"Audit report",  price:"$149", period:"one-time",  cta:"Get full report",  highlight:true,
    features:["Full tenant scan","Per-item details + severity","Gemini AI effort estimates","PDF executive report","SPFx replacement map"] },
  { id:"pro",   name:"Migration pro", price:"$49",  period:"/month",    cta:"Start monitoring", highlight:false,
    features:["Unlimited rescans","InfoPath wave (Jul 14)","Power Automate mapping","Progress tracking","Slack + email alerts"] },
  { id:"msp",   name:"MSP white-label",price:"$249",period:"/month",    cta:"Get MSP access",   highlight:false,
    features:["Unlimited client tenants","Your branding on reports","Client-facing dashboard","CSV / API export","Priority support"] },
];

// ─── Scan phases ─────────────────────────────────────────────────────────────
const PHASES = [
  { label:"Authenticating with Microsoft Graph API",     ms:1300 },
  { label:"Enumerating site collections (847 sites)",    ms:2200 },
  { label:"Scanning installed SharePoint Add-Ins",       ms:2800 },
  { label:"Detecting SharePoint 2013 workflow instances",ms:2100 },
  { label:"Checking InfoPath form libraries",            ms:1600 },
  { label:"Running Gemini 2.0 Flash analysis",           ms:3500 },
];

// ─── Mock scan data ───────────────────────────────────────────────────────────
const ADDINS = [
  { id:"a1", name:"Contracts Manager Pro",  site:"/sites/legal",      type:"Provider-hosted",    modified:"2023-08-14", sev:"critical",  hours:80,  spfx:"SPFx Application Page + SharePoint list" },
  { id:"a2", name:"HR Onboarding Portal",   site:"/sites/hr",         type:"Provider-hosted",    modified:"2022-11-02", sev:"critical",  hours:120, spfx:"SPFx Web Part + Viva Connections card" },
  { id:"a3", name:"Expense Approval App",   site:"/sites/finance",    type:"Provider-hosted",    modified:"2023-12-01", sev:"critical",  hours:96,  spfx:"SPFx + Power Apps + Power Automate" },
  { id:"a4", name:"Project Tracker v2",     site:"/sites/pmo",        type:"SharePoint-hosted",  modified:"2024-01-18", sev:"important", hours:40,  spfx:"SPFx List View Web Part" },
  { id:"a5", name:"Org Chart Viewer",       site:"/sites/intranet",   type:"SharePoint-hosted",  modified:"2021-06-30", sev:"important", hours:16,  spfx:"Microsoft 365 People web part (built-in)" },
  { id:"a6", name:"Document Classifier",   site:"/sites/compliance",  type:"SharePoint-hosted",  modified:"2022-03-15", sev:"important", hours:32,  spfx:"SPFx List Command Set extension" },
  { id:"a7", name:"News Aggregator",        site:"/sites/comms",      type:"SharePoint-hosted",  modified:"2020-11-10", sev:"low",       hours:8,   spfx:"SharePoint News web part (built-in, free)" },
  { id:"a8", name:"Leave Request Form",     site:"/sites/hr",         type:"SharePoint-hosted",  modified:"2021-04-22", sev:"low",       hours:12,  spfx:"Microsoft Lists + Power Automate (free)" },
];
const WORKFLOWS = [
  { id:"w1", name:"Contract Approval Flow",    site:"/sites/legal",      instances:47,  sev:"critical",  replacement:"Power Automate cloud flow with approval steps" },
  { id:"w2", name:"New Employee Checklist",    site:"/sites/hr",         instances:12,  sev:"critical",  replacement:"Power Automate + Adaptive Cards in Teams" },
  { id:"w3", name:"Document Review Reminder",  site:"/sites/pmo",        instances:183, sev:"important", replacement:"Power Automate scheduled trigger" },
  { id:"w4", name:"PO Sign-off Workflow",      site:"/sites/finance",    instances:29,  sev:"important", replacement:"Power Automate + SAP connector" },
  { id:"w5", name:"Archive Old Content",       site:"/sites/archive",    instances:0,   sev:"low",       replacement:"SharePoint built-in retention policy" },
];
const INFOPATH = [
  { id:"i1", name:"Incident Report Form",  site:"/sites/safety",      forms:340, sev:"critical",  replacement:"Power Apps canvas app" },
  { id:"i2", name:"IT Change Request",     site:"/sites/itsm",        forms:512, sev:"critical",  replacement:"Power Apps + ServiceNow connector" },
  { id:"i3", name:"Vendor Registration",   site:"/sites/procurement", forms:88,  sev:"important", replacement:"Power Apps + Dataverse" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SEV_COLOR = { critical:"#E24B4A", important:"#BA7517", low:"#1D9E75" };
const SEV_BG    = { critical:"#FCEBEB", important:"#FAEEDA", low:"#E1F5EE" };
const SEV_TXT   = { critical:"#791F1F", important:"#633806", low:"#085041" };
const pill = (sev) => ({
  display:"inline-block", fontSize:10, padding:"2px 7px", borderRadius:10,
  background:SEV_BG[sev], color:SEV_TXT[sev], fontWeight:500, textTransform:"capitalize",
});
const card = (extra={}) => ({
  background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)",
  borderRadius:12, padding:"1rem 1.25rem", ...extra
});
const btn = (variant="default", extra={}) => ({
  padding:"7px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:500,
  border: variant==="primary" ? "none" : "0.5px solid var(--color-border-secondary)",
  background: variant==="primary" ? "#185FA5" : "transparent",
  color: variant==="primary" ? "#fff" : "var(--color-text-secondary)",
  ...extra
});
const totalHours = ADDINS.reduce((s,a)=>s+a.hours,0);
const criticalCount = ADDINS.filter(a=>a.sev==="critical").length + WORKFLOWS.filter(w=>w.sev==="critical").length + INFOPATH.filter(i=>i.sev==="critical").length;

// ─── MSAL config (shown to user) ──────────────────────────────────────────────
const MSAL_CONFIG_SNIPPET = `// src/authConfig.js
export const msalConfig = {
  auth: {
    clientId: process.env.VITE_AZURE_CLIENT_ID,   // Azure AD app registration
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin,
  }
};
export const graphScopes = [
  "Sites.Read.All",       // enumerate all site collections
  "TermStore.Read.All",   // InfoPath term stores
];
// Required Graph API calls:
// GET /v1.0/sites?$select=id,displayName,webUrl&$top=500
// GET /v1.0/sites/{id}/lists?$filter=...
// SharePoint REST: /_api/web/AppTiles  (add-ins)
// SharePoint REST: /_api/web/WorkflowAssociations  (workflows)`;

// ─── Gemini proxy snippet (shown as code — NOT parsed as module export) ──────
const GEMINI_PROXY_SNIPPET = [
  "// api/gemini.js  (Vercel Edge function)",
  "export default async function handler(req) {",
  "  const { prompt } = await req.json();",
  "  const r = await fetch(",
  "    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,",
  "    { method:'POST', headers:{'Content-Type':'application/json'},",
  "      body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) }",
  "  );",
  "  const d = await r.json();",
  "  return new Response(JSON.stringify({ text: d.candidates?.[0]?.content?.parts?.[0]?.text ?? '' }),",
  "    { headers: { 'Content-Type': 'application/json' } });",
  "}",
].join("\n");

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP — orchestrates all views
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view, setView] = useState("landing");
  const [tier, setTier] = useState("free");
  const [scanPhase, setScanPhase] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [filterSev, setFilterSev] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [activeTab, setActiveTab] = useState("addins");

  // Drive the scan progress animation
  useEffect(() => {
    if (view !== "scanning") return;
    let phase = 0;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (phase >= PHASES.length) {
        setScanComplete(true);
        setTimeout(() => {
          if (!cancelled) { setView("results"); fetchAI(tier); }
        }, 900);
        return;
      }
      setScanPhase(phase);
      setTimeout(() => { phase++; run(); }, PHASES[phase < PHASES.length ? phase : PHASES.length - 1].ms);
    };
    const t = setTimeout(run, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [view]);

  const fetchAI = async (currentTier) => {
    if (currentTier === "free") return;
    setAiLoading(true);
    const prompt = `You are a Microsoft 365 migration expert writing for a non-technical IT Director. Write exactly 3 short paragraphs (no headings, no bullet points) as an executive summary for Contoso Corp. Their tenant has: 8 broken SharePoint Add-Ins (3 critical — Contracts Manager Pro, HR Onboarding Portal, Expense Approval App), 5 broken SharePoint 2013 workflows (2 critical — Contract Approval Flow, New Employee Checklist), and 3 InfoPath forms retiring July 14 2026. Total estimated remediation: 404 developer hours across 3 critical business systems. Cover: business impact right now, recommended priority order with rough budget, and what happens if they delay 30 more days. Be direct, concrete, under 200 words total.`;
    try {
      // In production: POST to /api/gemini (your Vercel Edge function → Gemini 2.0 Flash)
      // In this demo we call the Anthropic API directly as a stand-in.
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const d = await res.json();
      setAiAnalysis(d.content?.[0]?.text ?? "");
    } catch {
      setAiAnalysis("Three critical business systems stopped working on April 2nd when Microsoft retired the SharePoint Add-In framework. The Contracts Manager Pro, HR Onboarding Portal, and Expense Approval App are all inaccessible right now, along with the two workflows that support contract signing and new employee onboarding.\n\nPriority order: migrate the three provider-hosted add-ins first (est. 296 hours / ~$37K at $125/hr), then the two critical workflows (est. 40 hours), then address the July 14 InfoPath deadline. Budget roughly $60–80K for the full remediation if done by an external Microsoft partner.\n\nEvery 30-day delay costs approximately $15K in lost productivity and increases the risk of permanent data loss from the add-in web containers. The July 14 InfoPath retirement will add another 3 critical form failures on top of the current outage if not addressed concurrently.");
    }
    setAiLoading(false);
  };

  const handleStart = (selectedTier) => {
    setTier(selectedTier);
    setScanPhase(0);
    setScanComplete(false);
    setAiAnalysis("");
    setView("scanning");
  };

  if (view === "landing")  return <LandingPage onStart={handleStart} />;
  if (view === "scanning") return <ScanningView phase={scanPhase} complete={scanComplete} />;
  if (view === "results")  return <ResultsDashboard tier={tier} aiAnalysis={aiAnalysis} aiLoading={aiLoading} filterSev={filterSev} setFilterSev={setFilterSev} filterType={filterType} setFilterType={setFilterType} activeTab={activeTab} setActiveTab={setActiveTab} onReport={() => setView("report")} onBack={() => { setView("landing"); setScanPhase(0); setScanComplete(false); }} />;
  if (view === "report")   return <ReportView tier={tier} aiAnalysis={aiAnalysis} onBack={() => setView("results")} />;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function LandingPage({ onStart }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ fontFamily:"var(--font-sans)", padding:"1.5rem 0" }}>
      {/* Hero */}
      <div style={{ marginBottom:"2rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <div style={{ background:"#FCEBEB", border:"0.5px solid #F09595", borderRadius:6, padding:"3px 10px", fontSize:11, color:"#791F1F", fontWeight:500 }}>
            SharePoint Add-Ins retired April 2, 2026 — 3 days ago
          </div>
        </div>
        <h1 style={{ fontSize:26, fontWeight:500, color:"var(--color-text-primary)", margin:"0 0 8px", lineHeight:1.3 }}>
          M365 Retirement Audit
        </h1>
        <p style={{ fontSize:14, color:"var(--color-text-secondary)", margin:"0 0 1.5rem", lineHeight:1.6, maxWidth:520 }}>
          Browser-based scanner — no PowerShell, no CLI, no Azure app setup. Sign in with Microsoft, get a full tenant audit with Gemini AI effort estimates in under 3 minutes.
        </p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:"1.5rem" }}>
          {["No CLI required","No Azure app registration","Gemini AI effort estimates","PDF executive report"].map(f=>(
            <div key={f} style={{ fontSize:12, color:"var(--color-text-secondary)", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:6, padding:"3px 10px" }}>
              {f}
            </div>
          ))}
        </div>
        {/* Crisis callout */}
        <div style={{ background:"#FCEBEB", border:"0.5px solid #F09595", borderRadius:12, padding:"1rem 1.25rem", marginBottom:"1.5rem" }}>
          <div style={{ fontSize:13, fontWeight:500, color:"#791F1F", marginBottom:6 }}>4 retirements in 99 days</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {[
              ["Apr 2, 2026 — NOW","SharePoint Add-Ins","DEAD"],
              ["Apr 2, 2026 — NOW","SharePoint 2013 Workflows","DEAD"],
              ["Jul 14, 2026","InfoPath Forms Services","99 days"],
              ["Jul 14, 2026","SharePoint Server 2016/2019","99 days"],
            ].map(([date,name,badge])=>(
              <div key={name} style={{ fontSize:12, color:"#A32D2D" }}>
                <span style={{ fontWeight:500 }}>{badge}</span> — {name} ({date})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div style={{ fontSize:13, fontWeight:500, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:.5, marginBottom:12 }}>
        Pricing
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:10, marginBottom:"2rem" }}>
        {TIERS.map(t=>(
          <div key={t.id}
            onMouseEnter={()=>setHovered(t.id)} onMouseLeave={()=>setHovered(null)}
            style={{
              ...card(), cursor:"pointer",
              border: t.highlight ? "2px solid #185FA5" : hovered===t.id ? "0.5px solid var(--color-border-secondary)" : "0.5px solid var(--color-border-tertiary)",
              transition:"border-color .15s",
            }}
          >
            {t.highlight && <div style={{ fontSize:10, fontWeight:500, color:"#185FA5", background:"#E6F1FB", borderRadius:6, padding:"2px 8px", marginBottom:8, display:"inline-block" }}>Most popular</div>}
            <div style={{ fontSize:13, fontWeight:500, color:"var(--color-text-primary)", marginBottom:2 }}>{t.name}</div>
            <div style={{ marginBottom:10 }}>
              <span style={{ fontSize:22, fontWeight:500, color:"var(--color-text-primary)" }}>{t.price}</span>
              <span style={{ fontSize:12, color:"var(--color-text-secondary)" }}> {t.period}</span>
            </div>
            {t.features.map(f=>(
              <div key={f} style={{ fontSize:11, color:"var(--color-text-secondary)", marginBottom:4, display:"flex", gap:5 }}>
                <span style={{ color:"#1D9E75", marginTop:1 }}>✓</span> {f}
              </div>
            ))}
            <button onClick={()=>onStart(t.id)} style={{ ...btn(t.highlight?"primary":"default"), width:"100%", marginTop:12, textAlign:"center" }}>
              {t.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Architecture note */}
      <div style={{ ...card(), background:"var(--color-background-secondary)" }}>
        <div style={{ fontSize:11, fontWeight:500, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:.4, marginBottom:8 }}>Deployment architecture</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[
            ["Static frontend","Vercel / Netlify (free tier). React + Vite. No server required for the UI."],
            ["Auth","MSAL.js. Microsoft OAuth2. Sites.Read.All delegated permission. No ACS."],
            ["Graph API scanning","Runs entirely in the browser. Calls Microsoft Graph directly via MSAL token."],
            ["Gemini AI proxy","One Vercel serverless function (/api/gemini). Keeps GEMINI_API_KEY off client."],
            ["PDF export","Browser window.print() with print CSS. Zero server, zero Puppeteer."],
            ["Payments","Stripe.js checkout. One Stripe webhook serverless function."],
          ].map(([title,desc])=>(
            <div key={title} style={{ fontSize:12 }}>
              <span style={{ fontWeight:500, color:"var(--color-text-primary)" }}>{title}: </span>
              <span style={{ color:"var(--color-text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNING VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function ScanningView({ phase, complete }) {
  return (
    <div style={{ padding:"2rem 0", fontFamily:"var(--font-sans)" }}>
      <div style={{ fontSize:14, fontWeight:500, color:"var(--color-text-primary)", marginBottom:4 }}>Scanning tenant</div>
      <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:"1.5rem" }}>contoso.sharepoint.com</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:"1.5rem" }}>
        {PHASES.map((p,i)=>{
          const done = i < phase || complete;
          const active = i === phase && !complete;
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{
                width:18, height:18, borderRadius:"50%", flexShrink:0,
                background: done?"#1D9E75" : active?"#185FA5":"var(--color-background-secondary)",
                border: active?"2px solid #185FA5":"0.5px solid var(--color-border-tertiary)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                {done && <span style={{ color:"#fff", fontSize:10 }}>✓</span>}
                {active && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
              </div>
              <div style={{ fontSize:12, color: done?"var(--color-text-primary)": active?"var(--color-text-primary)":"var(--color-text-tertiary)", fontFamily: active?"var(--font-mono)":"var(--font-sans)" }}>
                {p.label}
              </div>
            </div>
          );
        })}
      </div>
      {/* Progress bar */}
      <div style={{ height:3, background:"var(--color-background-secondary)", borderRadius:2, overflow:"hidden", marginBottom:12 }}>
        <div style={{ height:"100%", background:"#185FA5", borderRadius:2, width:`${complete?100:Math.round((phase/PHASES.length)*100)}%`, transition:"width .4s ease
