# SmartSort AI — Backend

Express API for the SmartSort AI frontend: auth, saved comparison history, and a
server-side `/api/compare` endpoint that calls the Gemini API (so the
Gemini key never touches the browser).

## Quick start

```bash
npm install
# edit .env and set GEMINI_API_KEY=your-gemini-api-key-here
npm run dev
```

Server runs at `http://localhost:5000` by default.

Storage is an **in-memory store** (see `src/config/db.js`) — no database setup
needed to run/test. Data resets on restart. Swap that file for real database
models when you want persistence; controllers already go through it as a small
repository interface, so nothing else needs to change.

## Connect the frontend

In the HTML file, before the `<script>` block runs (or via browser console),
set:

```html
<script>window.SMARTSORT_API_BASE = 'http://localhost:5000/api';</script>
```

This is already the default (`http://localhost:5000/api`), so if you run the
backend on that port you don't need to set anything.

## Endpoints

| Method | Path                        | Auth | Description |
|--------|-----------------------------|------|-------------|
| GET    | /api/health                 | –    | Health check, reports whether a Gemini key is configured |
| POST   | /api/auth/register          | –    | `{ name, email, password }` → `{ token, user }` |
| POST   | /api/auth/login             | –    | `{ email, password }` → `{ token, user }` |
| GET    | /api/auth/me                | ✔    | → `{ user }` |
| POST   | /api/compare                | –    | `{ productA, productB, category, purpose }` → comparison JSON (calls Claude) |
| POST   | /api/history                | ✔    | Save a comparison result |
| GET    | /api/history?q=             | ✔    | List (optionally search) saved comparisons |
| PATCH  | /api/history/:id/favorite   | ✔    | Toggle favorite |
| DELETE | /api/history/:id            | ✔    | Delete a saved comparison |

Auth routes use `Authorization: Bearer <token>`.

## Testing without a Gemini key

Everything except `/api/compare` works with no key at all — you can fully
exercise register/login/me/history. `/api/compare` returns a clear `503` until
`GEMINI_API_KEY` is set in `.env`.

Manual smoke test:

```bash
curl http://localhost:5000/api/health

curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com","password":"secret123"}'

# use the returned token:
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <token>"

curl -X POST http://localhost:5000/api/compare \
  -H "Content-Type: application/json" \
  -d '{"productA":"iPhone 16 Pro","productB":"Galaxy S25 Ultra","category":"Smartphones","purpose":"photography"}'
```

## Notes

- Model used: `gemini-2.0-flash`, called via `@google/genai`.
- The compare prompt forces strict JSON output matching exactly what the
  frontend's `renderResults()` expects (see `src/controllers/compareController.js`).
- Passwords are hashed with bcrypt; sessions are stateless JWTs.
- CORS is wide open (`CORS_ORIGIN=*`) by default for local testing — lock this
  down to your real frontend origin before deploying.
