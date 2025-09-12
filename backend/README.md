Minimal Python backend (FastAPI) for image generation, editing, and descriptions using Google Gen AI SDK.

Quickstart

1) Prepare env
- export GOOGLE_API_KEY=your_key
- export ALLOWED_ORIGINS=https://your-frontend.example
- optional:
  - export GENAI_IMAGE_MODEL=gemini-2.5-flash-image-preview
  - export GENAI_TEXT_MODEL=gemini-2.5-flash

2) Install and run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Endpoints
- GET /healthz
- POST /v1/images/generate (form-data: prompt, image?, environment?, as=base64|stream)
- POST /v1/images/edit (form-data: prompt, image, as=base64|stream)
- POST /v1/photo/describe (json: { image_base64 })
- POST /v1/product/describe (json: { image_base64, product?, hints? })
  Note: The same routes are also available under /api/v1/* for reverse proxies without strip-path.

Notes
- Inline uploads only; keep total request size < ~20 MB.
- For larger files or reuse, consider the SDK File API later.
- Policy blocks return 422 with a friendly error.

Docker

Build and run locally:

```bash
docker build -t vintedboost-backend -f backend/Dockerfile .
docker run --rm -p 8080:8080 \
  -e GOOGLE_API_KEY=$GOOGLE_API_KEY \
  -e ALLOWED_ORIGINS=$ALLOWED_ORIGINS \
  vintedboost-backend
```

Dockploy hints
- Container Port: 8080
- Env: set GOOGLE_AI_API_KEY (or GOOGLE_API_KEY). The app accepts either.
- If your external path is /api, either enable strip-path or call /api/v1/* (both are mounted).
