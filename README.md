# JARVIS AI Backend (Part 18: AI API)

A tiny Express server that sits between the Android app and the
Anthropic API. This is required because an Android APK can be
decompiled — an API key baked into the app would leak. This server
holds the real key as an environment variable instead.

```
ANDROID APP  --(x-app-secret)-->  THIS SERVER  --(x-api-key)-->  Anthropic
```

## Deploying from an Android phone only (no PC)

You already have Termux + GitHub in your workflow, so:

1. **Push this `backend/` folder to a GitHub repo** using Termux:
   ```
   pkg install git
   cd backend
   git init
   git add .
   git commit -m "JARVIS backend"
   git branch -M main
   git remote add origin https://github.com/<you>/jarvis-backend.git
   git push -u origin main
   ```
   (`.env` is git-ignored on purpose — never push your real key.)

2. **Deploy on Render.com** (free tier, works entirely from Chrome,
   no CLI needed once the repo is on GitHub):
   - New → Web Service → connect your `jarvis-backend` GitHub repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Add environment variables in the Render dashboard:
     - `ANTHROPIC_API_KEY` = your real Anthropic key
     - `APP_SHARED_SECRET` = any long random string you make up
     - `ANTHROPIC_MODEL` = `claude-sonnet-4-6` (optional, this is the default)
   - Deploy. Render gives you a URL like
     `https://jarvis-backend-xxxx.onrender.com`.

3. **Put that URL + the same shared secret into the Android app** —
   see `AppConfig.kt` in the app source. Both sides must use the
   *identical* `APP_SHARED_SECRET` string.

## Testing it

```
curl -X POST https://your-app.onrender.com/api/chat \
  -H "content-type: application/json" \
  -H "x-app-secret: your-shared-secret" \
  -d '{"message":"Hello JARVIS"}'
```

## What this does NOT do yet

- No per-user accounts (Part 17: Authentication is separate).
- No persistent conversation storage (Part 19: Memory Backend).
- Rate limiting is a simple in-memory counter — fine for one small
  instance, not for scaling to many.

Per spec #59, this is a working baseline, not a claim of
"100% secure" — review before any production use.
