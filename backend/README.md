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

Notes
- Inline uploads only; keep total request size < ~20 MB.
- For larger files or reuse, consider the SDK File API later.
- Policy blocks return 422 with a friendly error.
