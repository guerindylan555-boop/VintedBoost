import os
import base64
from io import BytesIO
from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi import APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from PIL import Image

from google import genai
from google.genai import types as gtypes

# Config
MODEL_IMAGE = os.environ.get("GENAI_IMAGE_MODEL", "gemini-2.5-flash-image-preview")
MODEL_TEXT = os.environ.get("GENAI_TEXT_MODEL", "gemini-2.5-flash")
ALLOWED_ORIGINS = [o for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o]

app = FastAPI(title="vintedboost-backend", version="0.1.0")

# CORS (minimal: allow configured origins)
if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        max_age=600,
    )

def get_client() -> genai.Client:
    # Support both env names: GOOGLE_API_KEY (SDK default) and GOOGLE_AI_API_KEY (existing project)
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GOOGLE_AI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY env var")
    return genai.Client(api_key=api_key)


# Utilities

def _png_bytes_from_image_obj(image_obj) -> bytes:
    buf = BytesIO()
    # The SDK may return PIL.Image, bytes, or a container with inline_data
    if isinstance(image_obj, Image.Image):
        image_obj.save(buf, format="PNG")
    elif isinstance(image_obj, (bytes, bytearray)):
        # Assume already png/jpg bytes; we re-encode to PNG
        try:
            Image.open(BytesIO(image_obj)).save(buf, format="PNG")
        except Exception:
            buf.write(image_obj)
    else:
        # Fallback: try to locate .inline_data
        inline = getattr(image_obj, "inline_data", None) or getattr(image_obj, "inlineData", None)
        if inline and getattr(inline, "data", None):
            raw = base64.b64decode(inline.data)
            try:
                Image.open(BytesIO(raw)).save(buf, format="PNG")
            except Exception:
                buf.write(raw)
        else:
            # Last resort: stringify
            raise ValueError("Unsupported image object in response")
    buf.seek(0)
    return buf.getvalue()


def _extract_first_image_bytes(resp) -> Optional[bytes]:
    # Try candidates[].content.parts[].inline_data first
    try:
        for cand in getattr(resp, "candidates", []) or []:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for p in parts:
                inline = getattr(p, "inline_data", None) or getattr(p, "inlineData", None)
                if inline and getattr(inline, "data", None):
                    data_b64 = inline.data
                    mime = getattr(inline, "mime_type", None) or getattr(inline, "mimeType", None) or "image/png"
                    raw = base64.b64decode(data_b64)
                    # Ensure PNG output
                    try:
                        out = BytesIO()
                        Image.open(BytesIO(raw)).save(out, format="PNG")
                        out.seek(0)
                        return out.getvalue()
                    except Exception:
                        return raw
    except Exception:
        pass
    # SDK Imagen path: generated_images[0].image
    try:
        gen = getattr(resp, "generated_images", None) or getattr(resp, "generatedImages", None) or []
        if gen:
            img0 = gen[0].image
            if hasattr(img0, "bytesBase64Encoded"):
                raw = base64.b64decode(img0.bytesBase64Encoded)
            else:
                # PIL.Image in SDK types
                if isinstance(img0, Image.Image):
                    buf = BytesIO(); img0.save(buf, format="PNG"); buf.seek(0)
                    raw = buf.getvalue()
                else:
                    # Try to access raw bytes
                    raw = getattr(img0, "data", None)
            if raw:
                try:
                    out = BytesIO(); Image.open(BytesIO(raw)).save(out, format="PNG"); out.seek(0)
                    return out.getvalue()
                except Exception:
                    return raw
    except Exception:
        pass
    return None


def _as_inline_part_from_upload(file: UploadFile) -> gtypes.Part:
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file upload")
    mime = file.content_type or "image/png"
    return gtypes.Part.from_bytes(data=content, mime_type=mime)


def _as_inline_part_from_base64(image_base64: str) -> gtypes.Part:
    try:
        raw = base64.b64decode(image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")
    # Try to sniff mime
    mime = "image/jpeg"
    try:
        img = Image.open(BytesIO(raw))
        fmt = (img.format or "JPEG").upper()
        if fmt == "PNG":
            mime = "image/png"
        elif fmt == "WEBP":
            mime = "image/webp"
        elif fmt == "GIF":
            mime = "image/gif"
    except Exception:
        pass
    return gtypes.Part.from_bytes(data=raw, mime_type=mime)


@app.get("/healthz")
def healthz():
    return {"ok": True, "model_image": MODEL_IMAGE, "model_text": MODEL_TEXT}


api = APIRouter()


@api.post("/images/generate")
def generate_image(
    prompt: str = Form(...),
    image: Optional[UploadFile] = File(None),
    environment: Optional[UploadFile] = File(None),
    as_: Optional[str] = Form(None, alias="as"),
    client: genai.Client = Depends(get_client),
):
    try:
        parts: List[gtypes.Part] = []
        # Order matters: environment first, then the main image, then prompt
        if environment is not None:
            parts.append(_as_inline_part_from_upload(environment))
        if image is not None:
            parts.append(_as_inline_part_from_upload(image))
        parts.append(gtypes.Part.from_text(prompt))

        resp = client.models.generate_content(
            model=MODEL_IMAGE,
            contents=[gtypes.Content(role="user", parts=parts)],
            config=gtypes.GenerateContentConfig(
                safety_settings=[
                    gtypes.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                    gtypes.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_ONLY_HIGH"),
                    gtypes.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_ONLY_HIGH"),
                    gtypes.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_ONLY_HIGH"),
                ]
            ),
        )
        img_bytes = _extract_first_image_bytes(resp)
        if not img_bytes:
            return JSONResponse({"error": "no image"}, status_code=422)
        if (as_ or "").lower() == "base64":
            return {"image_base64": base64.b64encode(img_bytes).decode("utf-8")}
        return StreamingResponse(BytesIO(img_bytes), media_type="image/png")
    except genai.errors.APIError as e:  # type: ignore[attr-defined]
        code = getattr(e, "code", 500) or 500
        msg = getattr(e, "message", str(e))
        if "not available" in msg.lower():
            return JSONResponse({"error": msg}, status_code=409)
        if code == 429:
            return JSONResponse({"error": "rate limited", "detail": msg}, status_code=429)
        if any(k in msg.lower() for k in ["policy", "blocked", "safety", "harm_category", "invalid_argument"]):
            return JSONResponse({"error": "policy blocked", "detail": msg}, status_code=422)
        return JSONResponse({"error": msg}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@api.post("/images/edit")
def edit_image(
    prompt: str = Form(...),
    image: UploadFile = File(...),
    as_: Optional[str] = Form(None, alias="as"),
    client: genai.Client = Depends(get_client),
):
    try:
        parts: List[gtypes.Part] = [
            _as_inline_part_from_upload(image),
            gtypes.Part.from_text(prompt),
        ]
        resp = client.models.generate_content(
            model=MODEL_IMAGE,
            contents=[gtypes.Content(role="user", parts=parts)],
        )
        img_bytes = _extract_first_image_bytes(resp)
        if not img_bytes:
            return JSONResponse({"error": "no edited image"}, status_code=422)
        if (as_ or "").lower() == "base64":
            return {"image_base64": base64.b64encode(img_bytes).decode("utf-8")}
        return StreamingResponse(BytesIO(img_bytes), media_type="image/png")
    except genai.errors.APIError as e:  # type: ignore[attr-defined]
        code = getattr(e, "code", 500) or 500
        msg = getattr(e, "message", str(e))
        if code == 429:
            return JSONResponse({"error": "rate limited", "detail": msg}, status_code=429)
        if any(k in msg.lower() for k in ["policy", "blocked", "safety", "harm_category", "invalid_argument"]):
            return JSONResponse({"error": "policy blocked", "detail": msg}, status_code=422)
        return JSONResponse({"error": msg}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class ProductMeta(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    gender: Optional[str] = None
    size: Optional[str] = None
    condition: Optional[str] = None


class ProductDescribeIn(BaseModel):
    image_base64: str = Field(..., description="Base64 of the product image")
    product: Optional[ProductMeta] = None
    hints: Optional[str] = None


@api.post("/product/describe")
def product_describe(
    body: ProductDescribeIn,
    client: genai.Client = Depends(get_client),
):
    parts: List[gtypes.Part] = []
    system = (
        "Tu es un assistant e-commerce Vinted. Rédige en FRANÇAIS clair et précis. "
        "Réponds UNIQUEMENT en JSON strict."
    )
    instruction = (
        "À partir de la photo du vêtement et des infos fournies, génère une fiche Vinted complète."
    )
    schema_text = (
        '{"title": string, "brand": string|null, "model": string|null, "category": string|null, '
        '"condition": string, "defects": string[], '
        '"measurements": {"longueur": string|null, "poitrine": string|null, "epaules": string|null, "manches": string|null}, '
        '"care": string[], "keywords": string[], "bulletPoints": string[], "descriptionText": string}'
    )

    try:
        img_part = _as_inline_part_from_base64(body.image_base64)
        text_blob = f"{system}\n\n{instruction}\n\nSchema attendu:\n{schema_text}\n\nInfos vêtement: {body.product.dict() if body.product else {}}\nIndices: {body.hints or '(aucun)'}"
        parts = [gtypes.Part.from_text(text_blob), img_part]

        resp = client.models.generate_content(
            model=MODEL_TEXT,
            contents=[gtypes.Content(role="user", parts=parts)],
            config=gtypes.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        # Collect text across parts
        text_out = ""
        for cand in getattr(resp, "candidates", []) or []:
            content = getattr(cand, "content", None)
            parts_out = getattr(content, "parts", []) if content else []
            for p in parts_out:
                t = getattr(p, "text", None)
                if isinstance(t, str):
                    text_out += (t + "\n")
        text_out = text_out.strip()
        if not text_out:
            return JSONResponse({"error": "no json"}, status_code=422)
        # Try to parse JSON
        import json
        try:
            data = json.loads(text_out)
        except Exception:
            # best-effort: extract first {...}
            import re
            m = re.search(r"\{[\s\S]*\}$", text_out)
            if not m:
                return JSONResponse({"raw": text_out}, status_code=200)
            data = json.loads(m.group(0))
        return JSONResponse(data)
    except genai.errors.APIError as e:  # type: ignore[attr-defined]
        code = getattr(e, "code", 500) or 500
        msg = getattr(e, "message", str(e))
        if code == 429:
            return JSONResponse({"error": "rate limited", "detail": msg}, status_code=429)
        if any(k in msg.lower() for k in ["policy", "blocked", "safety", "harm_category", "invalid_argument"]):
            return JSONResponse({"error": "policy blocked", "detail": msg}, status_code=422)
        return JSONResponse({"error": msg}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class PhotoDescribeIn(BaseModel):
    image_base64: str


@api.post("/photo/describe")
def photo_describe(
    body: PhotoDescribeIn,
    client: genai.Client = Depends(get_client),
):
    try:
        img_part = _as_inline_part_from_base64(body.image_base64)
        prompt = (
            "Ignore toute personne/corps/vêtement/accessoire. Décris uniquement l'environnement, arrière-plan, "
            "ambiance lumineuse, style et éléments de décor visibles."
        )
        parts = [img_part, gtypes.Part.from_text(prompt)]
        resp = client.models.generate_content(
            model=MODEL_TEXT,
            contents=[gtypes.Content(role="user", parts=parts)],
        )
        # First text part
        for cand in getattr(resp, "candidates", []) or []:
            content = getattr(cand, "content", None)
            parts_out = getattr(content, "parts", []) if content else []
            for p in parts_out:
                t = getattr(p, "text", None)
                if isinstance(t, str) and t.strip():
                    return {"descriptionText": t.strip()}
        return JSONResponse({"error": "no text"}, status_code=422)
    except genai.errors.APIError as e:  # type: ignore[attr-defined]
        code = getattr(e, "code", 500) or 500
        msg = getattr(e, "message", str(e))
        if code == 429:
            return JSONResponse({"error": "rate limited", "detail": msg}, status_code=429)
        if any(k in msg.lower() for k in ["policy", "blocked", "safety", "harm_category", "invalid_argument"]):
            return JSONResponse({"error": "policy blocked", "detail": msg}, status_code=422)
        return JSONResponse({"error": msg}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# Mount router under both /v1 and /api/v1 to work with or without a reverse-proxy path prefix
app.include_router(api, prefix="/v1")
app.include_router(api, prefix="/api/v1")
