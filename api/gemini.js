// api/gemini.js
// Vercel serverless function — keeps GEMINI_API_KEY off the client.
// Deploy alongside your Vite app on Vercel — it auto-detects /api/* as serverless functions.
//
// Environment variables to set in Vercel dashboard:
//   GEMINI_API_KEY   — your Google AI Studio key
//
// In your React app, call it like:
//   const res = await fetch('/api/gemini', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ prompt })
//   });
//   const { text } = await res.json();

export const config = { runtime: 'edge' };  // Edge runtime = fastest cold starts

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let prompt;
  try {
    const body = await req.json();
    prompt = body.prompt;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!prompt) {
    return new Response('Missing prompt', { status: 400 });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return new Response('GEMINI_API_KEY not configured', { status: 500 });
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    return new Response(`Gemini API error: ${err}`, { status: 502 });
  }

  const data = await geminiRes.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  });
        }

