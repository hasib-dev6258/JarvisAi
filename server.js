// ============================================================
// JARVIS AI — BACKEND (PART 18: AI API)
// ============================================================
//
// This is the "SECURE API SERVER" layer from the project spec
// (#26 AI Backend):
//
//   ANDROID APP -> SECURE API SERVER -> AI SERVICE
//
// Using Google Gemini here because its free tier needs no credit
// card (spec #27: provider-independent — swap this file's upstream
// call and you can point at a different provider without touching
// the Android app at all).
//
// The Gemini API key lives ONLY here, as an environment variable
// on whatever host runs this file (Render, Railway, Fly.io, etc.)
// — never inside the Android app, never in Git.
//
// The Android app authenticates to THIS server with a separate,
// low-value "app shared secret" (APP_SHARED_SECRET) — not the
// real API key — so a decompiled APK leaks nothing expensive.
// ============================================================

const express = require('express');

const app = express();
app.use(express.json({ limit: '32kb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
(!GEMINI_API_KEY)KEY  console.error(
    'FATAL: GEMINI_API_KEY is not set. Get a free key at ' +
    'https://aistudio.google.com/apikey and set it as an ' +
    'environment variable on your host — never hard-code it here.'
  );
  process.exit(1);
}

if (!APP_SHARED_SECRET) {
  console.error(
    'FATAL: APP_SHARED_SECRET is not set. This is the secret the ' +
    'Android app sends to prove it is your app, not the general ' +
    'internet. Set any long random string as an environment variable.'
  );
  process.exit(1);
}

// ------------------------------------------------------------
// Very small in-memory rate limiter (spec #59: Rate Abuse).
// Per-process only — fine for a single small instance. If you
// scale to multiple instances later, replace with a shared store
// (e.g. Redis) instead of in-memory Maps.
// ------------------------------------------------------------
const REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 60 * 1000;
const requestLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > REQUESTS_PER_WINDOW;
}

// ------------------------------------------------------------
// Auth middleware: checks the app's shared secret header.
// ------------------------------------------------------------
function requireAppSecret(req, res, next) {
  const provided = req.header('x-app-secret');

  if (!provided || provided !== APP_SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/chat', requireAppSecret, async (req, res) => {

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Slow down.' });
  }

  const { message, history } = req.body || {};

  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'message is too long' });
  }

  // history, if provided, must be an array of {role, content} pairs.
  // We validate shape rather than trusting the client blindly.
  const cleanHistory = Array.isArray(history)
    ? history
        .filter(
          (m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string'
        )
        .slice(-20) // cap context sent upstream
    : [];

  // Gemini uses "model" instead of "assistant" for the AI's turns,
  // and wraps text in a {parts:[{text}]} shape rather than a plain
  // string.
  const contents = [
    ...cleanHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents,
          system_instruction: {
            parts: [
              {
                text:
                  'You are JARVIS, a helpful personal AI assistant ' +
                  'inside an Android app. Keep replies concise and ' +
                  'conversational, suitable for a voice assistant.'
              }
            ]
          }
        })
      }
    );

    if (!upstream.ok) {
      const errorBody = await upstream.text();
      console.error('Gemini API error:', upstream.status, errorBody);
      return res.status(502).json({ error: 'AI Backend Offline' });
    }

    const data = await upstream.json();

    const reply = (data.candidates || [])
      .flatMap((c) => c.content?.parts || [])
      .map((p) => p.text || '')
      .join('\n')
      .trim();

    if (!reply) {
      return res.status(502).json({ error: 'AI Backend Offline' });
    }

    return res.json({ reply });

  } catch (err) {
    console.error('Upstream request failed:', err);
    return res.status(502).json({ error: 'AI Backend Offline' });
  }
});

app.listen(PORT, () => {
  console.log(`JARVIS AI backend listening on port ${PORT}`);
});
