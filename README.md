VintedBoost — MVP Try-On + Description Vinted (Next.js + Google AI / OpenRouter)

Quick start

- Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY` and `GOOGLE_AI_API_KEY`.
- Optional: set `IMAGE_PROVIDER` (`google` by default) to `openrouter` if you prefer OpenRouter for images.
- If you want server persistence locally, also set `POSTGRES_URL` to a Vercel Postgres connection string.
- Run `npm run dev` then open http://localhost:3000
- Upload a “non porté” photo, set the reference, choose mannequin options, click “Générer”.
- Configure the new toggles (genre, taille du vêtement, pose, style, environnement) — the prompt preview updates live — then click “Générer”.

Notes

- Descriptions: toujours générées via OpenRouter avec le modèle `openai/gpt-5-mini`.
- Génération d'images: Google AI (`gemini-2.5-flash-image-preview`) par défaut, basculable vers OpenRouter via l'interface Paramètres ou `IMAGE_PROVIDER`.
- Images are returned as base64 Data URLs and are downloadable.
- History persists locally in `localStorage` with “dupliquer l’annonce”.
- A prompt preview shows the exact instruction sent to the image model, adapted for the Vinted marketplace and “mannequin réaliste”. No custom free‑text is required.

Server history (Vercel Postgres)

- API routes: `GET /api/history` (list), `POST /api/history` (create), `GET /api/history/:id`.
- Anonymous sessions via cookie `vb_session` (6 months) — no login required.
- Table is auto-created (`history_items`) on first request.
- On Vercel, add the Postgres integration and redeploy; env vars will be injected.

OpenRouter references

- API: https://openrouter.ai/docs/api-reference/overview
- Model page: https://openrouter.ai/google/gemini-2.5-flash-image-preview
