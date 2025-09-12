import os
import base64
from io import BytesIO
from typing import Optional, List, Tuple

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi import APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from PIL import Image

from google import genai
from google.genai import types as gtypes
import time
import uuid

try:
    import boto3  # type: ignore
    from botocore.exceptions import BotoCoreError, ClientError  # type: ignore
except Exception:  # boto3 is optional unless S3 is used
    boto3 = None  # type: ignore
    BotoCoreError = ClientError = Exception  # type: ignore

# Config
MODEL_IMAGE = os.environ.get("GENAI_IMAGE_MODEL", "gemini-2.5-flash-image-preview")
MODEL_TEXT = os.environ.get("GENAI_TEXT_MODEL", "gemini-2.5-flash")
ALLOWED_ORIGINS = [o for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o]
AWS_S3_BUCKET = os.environ.get("AWS_S3_BUCKET")
AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
AWS_S3_PUBLIC = (os.environ.get("AWS_S3_PUBLIC", "").lower() in ("1", "true", "yes"))
AWS_CLOUDFRONT_DOMAIN = os.environ.get("AWS_CLOUDFRONT_DOMAIN")
AWS_S3_PRESIGN_TTL = int(os.environ.get("AWS_S3_PRESIGN_TTL", "86400"))  # 1 day default

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


def _get_s3_client():
    if not AWS_S3_BUCKET:
        return None
    if boto3 is None:
        raise HTTPException(status_code=500, detail="boto3 not installed - required for S3 uploads")
    return boto3.client("s3", region_name=AWS_REGION)


def _public_url_from_key(key: str) -> str:
    if AWS_CLOUDFRONT_DOMAIN:
        domain = AWS_CLOUDFRONT_DOMAIN.strip().rstrip("/")
        return f"https://{domain}/{key}"
    # Fallback to S3 regional URL
    return f"https://{AWS_S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"


def _upload_image_bytes_and_get_url(data: bytes, content_type: str, user_id: str, kind: str) -> Tuple[str, str]:
    s3 = _get_s3_client()
    if s3 is None:
        raise HTTPException(status_code=409, detail="S3 not configured (AWS_S3_BUCKET missing)")
    ts = int(time.time())
    uid = uuid.uuid4().hex
    key = f"users/{user_id or 'anon'}/{kind}/{ts}/{uid}.png"
    try:
        put_kwargs = {
            "Bucket": AWS_S3_BUCKET,
            "Key": key,
            "Body": data,
            "ContentType": content_type,
        }
        if AWS_S3_PUBLIC:
            put_kwargs["ACL"] = "public-read"
        s3.put_object(**put_kwargs)
        if AWS_S3_PUBLIC:
            url = _public_url_from_key(key)
        else:
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": AWS_S3_BUCKET, "Key": key},
                ExpiresIn=AWS_S3_PRESIGN_TTL,
            )
        return url, key
    except (BotoCoreError, ClientError) as e:  # type: ignore
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {getattr(e, 'message', str(e))}")


@app.get("/healthz")
def healthz():
    return {"ok": True, "model_image": MODEL_IMAGE, "model_text": MODEL_TEXT}


@app.get("/health")
def health():
    return healthz()


@app.get("/")
def root():
    # Simple root endpoint for quick checks
    return {"ok": True, "service": "vintedboost-backend"}


@app.get("/api/health")
def api_health():
    return healthz()


@app.get("/api/healthz")
def api_healthz():
    return healthz()


api = APIRouter()


@api.post("/images/generate")
def generate_image(
    prompt: str = Form(...),
    image: Optional[UploadFile] = File(None),
    environment: Optional[UploadFile] = File(None),
    as_: Optional[str] = Form(None, alias="as"),
    return_mode: Optional[str] = Form(None, alias="return"),
    request: Request = None,
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
        # Durable URL path if requested and S3 configured
        if (return_mode or "").lower() in ("url", "s3") and AWS_S3_BUCKET:
            try:
                # Best-effort user id from header, else anon
                user_id = request.headers.get("x-user-id", "anon") if request else "anon"
                url, key = _upload_image_bytes_and_get_url(img_bytes, "image/png", user_id, "gen")
                return {"url": url, "key": key}
            except HTTPException as e:
                # Fall back to streaming if S3 not configured
                if e.status_code == 409:
                    pass
                else:
                    raise
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
    return_mode: Optional[str] = Form(None, alias="return"),
    request: Request = None,
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
        if (return_mode or "").lower() in ("url", "s3") and AWS_S3_BUCKET:
            try:
                user_id = request.headers.get("x-user-id", "anon") if request else "anon"
                url, key = _upload_image_bytes_and_get_url(img_bytes, "image/png", user_id, "edit")
                return {"url": url, "key": key}
            except HTTPException as e:
                if e.status_code == 409:
                    pass
                else:
                    raise
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
