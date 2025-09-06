VintedBoost — MVP Try-On + Description Vinted (Next.js + OpenRouter)

Quick start

- Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY`.
- Run `npm run dev` then open http://localhost:3000
- Upload a “non porté” photo, set the reference, choose mannequin options, click “Générer”.

Notes

- Texte: model defaults to `openai/gpt-5-mini` (change via `OPENROUTER_TEXT_MODEL`).
- Images: model `google/gemini-2.5-flash-image-preview` (overridable via `OPENROUTER_IMAGE_MODEL`).
- Images are returned as base64 Data URLs and are downloadable.
- History persists locally in `localStorage` with “dupliquer l’annonce”.

OpenRouter references

- API: https://openrouter.ai/docs/api-reference/overview
- Model page: https://openrouter.ai/google/gemini-2.5-flash-image-preview
