# MƏSKƏN — working rules

Spec: `SPEC.md` (condensed, authoritative) and `SPEC-full.md` (longer original). Re-read only the section you need.
Next.js in this repo is v16 — see `AGENTS.md` and `node_modules/next/dist/docs/` before using unfamiliar APIs.

## Token & time discipline
- NEVER print/Read raw data files (GeoJSON, OSM JSON, CSV >50 rows). Inspect with one-line node summaries (counts, keys, 1–2 records, file size).
- Every fetch script caches raw responses in data/raw/ and skips if cache exists. Never re-download.
- Pipeline: data/raw → scripts → data/processed → public/data (small, simplified). App reads ONLY public/data.
- Edit files surgically. Never regenerate a whole file to change a few lines.
- No refactors, no extra abstractions. Testing is REQUIRED: evals in /evals (intent, legal, grounding, retrieval, data-sanity) → public/data/evals.json, shown on /keyfiyyet. `npm run check` = data-sanity + zod + next build. Every bug fix gets a sanity check so it cannot come back.
- Only dependencies listed in SPEC §4. A new one only if it saves >30 min.
- A source fails twice → mark "unavailable" in data/processed/sources.json, move on. No retry loops.
- Never scrape Google Maps, Yandex, Waze, bina.az, tap.az. Official APIs with keys from .env only.
- After each phase: ≤8-line summary, then continue automatically. Ask the human ONLY when a manual CSV must be filled; meanwhile continue with mock values.

## Data honesty (judges check this)
- Every number in UI has a source badge: Canlı (OSM) / Rəsmi (DSK) / Hesablanıb / Nümunə / Demo / Model.
- Never invent figures. Missing → "məlumat yoxdur", not 0. Low OSM coverage → visible warning; AI text must mention it.
- AI may only use numbers present in the JSON passed to it; may cite law articles ONLY if their text is in data/legal/.

## Conventions
- Next.js App Router + TypeScript + Tailwind, src/ layout. UI language Azerbaijani (Latin, ə ğ ı ş ç ö ü). Code in English.
- src/lib/types.ts is the contract between data and UI.
- AI = Google Gemini (free tier) via @google/genai. All calls go through src/lib/ai.ts generateJSON(prompt, zodSchema): JSON mode + responseJsonSchema, zod validation, 1 retry, sha256 cache in data/ai-cache/, graceful fallback. Server-side only.
- Free-tier limits: batch scripts run concurrency 1 with ~4 s delay and 429 backoff; live routes return cached result or "AI hazırda məşğuldur" on 429.
