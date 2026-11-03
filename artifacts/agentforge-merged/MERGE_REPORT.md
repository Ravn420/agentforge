# AgentForge Merge Report

## What was merged
- Base: `ravn420-miniature-carnival` (Python FastAPI backend + simpler React GUI)
- Incoming: AI Studio AgentForge (full React frontend with Deep Research, Media Studio, Gateways, PWA, Firebase, Node/Express server)

## Final structure (`/workspace/artifacts/agentforge-merged`)
- `backend/` — original Python FastAPI agent engine (preserved)
- `entities/` — original entity schemas
- `src/` — carnival React app + studio components:
  - DeepResearchView.tsx, MediaStudioModal.tsx, GatewaysView.tsx
  - ResearchSynapse.tsx, ConnectorIcon.tsx, PWAInstallButton.tsx
  - api.ts, server_deep_research.ts, usePWAInstall.ts
  - plus original hooks/, components/, types/
- `server.ts` — Node/Express server with Gemini deep research endpoints
- `package.json` — unified dependencies (React 19, Firebase, @google/genai, Vite PWA, etc.)
- `public/` — PWA icons, manifest, assets
- Firebase config, firestore.rules, security_spec.md, .env.example

## How to run
```bash
cd agentforge-merged
npm install
# Frontend + Node server (deep research):
npm run dev
# Or Python backend separately:
npm run backend
```

## Issues found during scan

### High priority
1. **Exposed Firebase API key** in `firebase-applet-config.json`
   - Key: `AIzaSyAogxFNhIvV3sGYiVEa13qI4UqrQtkBIHk`
   - This is a client-side Firebase config (normally public), but the projectId and other IDs are specific. Rotate or restrict if this was a private key.
2. **Two competing App.tsx implementations**
   - Merged `src/App.tsx` is the smaller carnival version (~607 lines).
   - Studio `App.tsx` is 4096 lines and already wires DeepResearchView, MediaStudio, Gateways, Firebase auth, PWA.
   - Recommendation: replace or carefully integrate the studio App.tsx as the main entry if you want the full UI.
3. **Dual backends**
   - Python FastAPI (`backend/`) and Node Express (`server.ts`) both exist.
   - They are not wired together. Choose one or add a proxy.

### Medium priority
4. **Tailwind version mismatch risk**
   - Carnival used Tailwind 3; studio/merged uses Tailwind 4 + `@tailwindcss/vite`. Config files may need adjustment.
5. **Missing integration in carnival App.tsx**
   - New views (DeepResearchView, etc.) are present but not imported/used in the current App.tsx.
6. **Large binary assets** in public/ and .aistudio (screenshots, media) — consider cleaning for size.
7. **GEMINI_API_KEY** required for deep research (see .env.example). Not set by default.

### Low priority
8. TypeScript strictness may surface errors once both App versions and new components are fully wired (run `npm run lint`).
9. Firebase auth + Firestore rules need review against `firestore.rules` and `security_spec.md`.
10. PWA service worker registration in main.tsx assumes vite-plugin-pwa is configured in vite.config.ts (copied).

## Recommended next steps
1. Decide on primary UI: replace `src/App.tsx` with the studio version or integrate the new views.
2. Run `npm install && npm run lint` to surface type errors.
3. Restrict or rotate the Firebase API key if needed.
4. Test deep research flow with a valid GEMINI_API_KEY.
5. Optionally proxy Python backend calls from the Node server.

Merge completed in `/workspace/artifacts/agentforge-merged`.
