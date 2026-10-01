# CampusPulse full-stack sample — axios ⇄ Express + CORS

Week 4 Blocks B and C. A React page calls an Express API **on a different
origin** using a configured axios instance:
- The frontend runs on `http://localhost:5173`.
- The API runs on `http://localhost:3001/api`.

The two origins are deliberate: the browser enforces CORS, so the backend's
CORS policy is real. Every code excerpt on the Block B and C slides comes
from this folder. All data is synthetic and stored in memory, so a restart
resets it.

```
campuspulse-fullstack/
├── backend/                     Express 5 + cors (Block C)
│   ├── src/server.mjs           entry point: PORT, CORS_ORIGINS
│   ├── src/app.mjs              middleware order, 404 + JSON error handler
│   ├── src/cors-options.mjs     exact-origin allowlist, preflight settings
│   ├── src/incidents.mjs        GET / POST / PUT / PATCH / DELETE routes
│   └── test/api.test.mjs        CRUD, errors, CORS + preflight tests
└── frontend/                    React + TypeScript + Vite + axios (Block B)
    ├── src/api/client.ts        axios.create, interceptors, ApiError
    ├── src/api/incidents.ts     one typed function per endpoint
    ├── src/App.tsx              loading/error state, AbortController, demos
    └── test/api.test.ts         the real axios calls against the real API
```

## Run it (Windows PowerShell or macOS Terminal)

You need Node.js 20.19 or newer. The course standard is Node 24. Open **two**
terminals at this folder (`weeks/week04/samples/campuspulse-fullstack`).

```bash
# Terminal 1 — the API
cd backend
npm install
npm start            # CampusPulse API on http://localhost:3001/api
```

```bash
# Terminal 2 — the frontend
cd frontend
npm install
npm run dev          # open http://localhost:5173
```

The commands are the same on Windows and macOS. To check the API on its own:

| Check | Windows PowerShell | macOS / Linux |
| --- | --- | --- |
| Health | `Invoke-RestMethod http://localhost:3001/api/healthz` | `curl -s http://localhost:3001/api/healthz` |
| List | `Invoke-RestMethod "http://localhost:3001/api/incidents?status=resolved"` | `curl -s "http://localhost:3001/api/incidents?status=resolved"` |
| Create | `Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/incidents -ContentType application/json -Body '{"title":"Projector offline","service":"d2l"}'` | `curl -s -X POST http://localhost:3001/api/incidents -H 'Content-Type: application/json' -d '{"title":"Projector offline","service":"d2l"}'` |
| Preflight | `curl.exe -i -X OPTIONS http://localhost:3001/api/incidents -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: PATCH"` | `curl -i -X OPTIONS http://localhost:3001/api/incidents -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: PATCH'` |

In Windows PowerShell 5.1, `curl` is an alias for `Invoke-WebRequest`. Type
`curl.exe` to run the real curl that ships with Windows 10 and 11.

## What to try in class

1. **Every HTTP method.** Create an incident (POST), change its status
   (PATCH), rename it (PUT) and delete it (DELETE). Watch the *Requests*
   table and the DevTools **Network** tab side by side.
2. **Preflight.** In DevTools, filter by `incidents` and look for `OPTIONS`
   (preflight) requests. Two things trigger them:
   - The axios interceptor adds a custom `X-Request-Id` header, so even
     GETs are preflighted.
   - POST, PUT and PATCH send `Content-Type: application/json`.

   The browser then caches each answer for 10 minutes
   (`Access-Control-Max-Age: 600`), so you see one preflight per URL and
   method, not one per click.
3. **Cancel and timeout.** Click *Slow GET* and then *Cancel*. That is
   `AbortController`. Then click *GET past the 4 s timeout*, which shows
   axios's `timeout`.
4. **A real CORS failure.** Stop Terminal 2 and run
   `npm run dev:wrong-origin`, then open `http://localhost:5174`.
   - The page shows a network error.
   - The DevTools Console shows *"blocked by CORS policy"*.
   - The API terminal shows that the server never saw a GET: the browser
     stopped at the failed preflight.
   - Fix it without editing code. Restart the API with the new origin
     added; the commands are below.

```powershell
# Windows PowerShell
$env:CORS_ORIGINS = "http://localhost:5173,http://localhost:5174"; npm start
```

```bash
# macOS / Linux
CORS_ORIGINS=http://localhost:5173,http://localhost:5174 npm start
```

## Tests

```bash
cd backend  && npm test        # 7 tests: CRUD, error shape, CORS headers, preflight
cd frontend && npm test        # 4 tests: axios functions, ApiError, abort/timeout, interceptors
cd frontend && npm run build   # type-check + production bundle
```

The frontend tests import the backend app. Run `npm install` in **both**
folders first.

## Production notes (Week 9 goes deeper)

- CORS is not authentication. It only controls which *browser* pages may
  read responses. curl, scripts and other servers ignore it.
- Keep an exact allowlist. Never reflect any `Origin` back, and never
  combine `*` with credentials.
- A dev-server proxy (Vite `server.proxy`) or serving both from one origin
  avoids CORS entirely. This sample keeps them separate on purpose.
- Use HTTPS (Week 4 Block A) in front of both in production.
