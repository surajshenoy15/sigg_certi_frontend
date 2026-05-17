# Certificate Generator · Frontend (React + Vite)

## Quick Start

```bash
# 1. Install
npm install

# 2. Make sure the FastAPI backend is running on port 8000
#    (cd ../backend && uvicorn main:app --reload)

# 3. Launch
npm run dev
```

Open <http://localhost:5173>.

Vite proxies `/api` and `/files` to `http://localhost:8000` so CORS is never an issue in development.

## Build for production

```bash
npm run build
# dist/ can be served by any static host, or by FastAPI:
#   app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="ui")
```

## Custom API base

If your backend lives elsewhere, create `.env`:

```
VITE_API_BASE=https://your-api.example.com
```

## Flow

1. **Upload** the certificate template (JPG/PNG) and the recipient sheet (CSV/XLSX with `name` + `email` columns).
2. **Place name**: click on the live preview where the name should sit, tweak size/color/font.
3. **Generate** → all certificates are rendered server-side.
4. **Dispatch** → write the email and send. Watch the live progress log.
