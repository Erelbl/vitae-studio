# Film Product - Technical Foundation

## Overview

The Film product transforms an existing album order into a page-turn video with AI narration and subtle Ken Burns motion effects. This document describes the foundation layer — database tables, service skeletons, and admin UI — implemented ahead of the full rendering pipeline.

---

## Database Tables

### film_projects

One-to-one with `orders` (unique index on `order_id`, CASCADE delete).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| status | TEXT | `draft → scenes_built → narration_pending → narration_ready → rendering → rendered → assembled` (+ `error`) |
| narration_mode | TEXT | `ai`, `manual`, or `none` |
| selected_voice_id | TEXT | Chosen ElevenLabs voice ID |
| voice_choice_status | TEXT | `pending → samples_ready → chosen` |
| voice_sample_a/b_path | TEXT | Storage paths for A/B voice samples |
| voice_sample_a/b_voice_id | TEXT | ElevenLabs voice IDs for each sample |
| motion_style | TEXT | `gentle`, `dynamic`, or `none` |
| music_enabled | BOOLEAN | Whether to mix background music |
| music_track_path | TEXT | Storage path for music track |
| final_video_path | TEXT | Storage path for assembled video |
| final_duration_seconds | REAL | Total film length |
| render_version | INT | Incremented on each render pass |
| error_message | TEXT | Last error if status = error |

### film_scenes

Many-to-one with `film_projects` (CASCADE delete).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| film_project_id | UUID FK → film_projects | |
| page_spread_key | TEXT | Spread identifier (e.g. "spread_01") |
| page_ids_json | JSONB | Array of page UUIDs in this scene |
| scene_order | INT | Sequence position |
| source_text | TEXT | Original album page text |
| narration_text | TEXT | Adjusted text for TTS |
| voice_id | TEXT | ElevenLabs voice ID for this scene |
| motion_preset | TEXT | e.g. "ken_burns" |
| transition_in / transition_out | TEXT | e.g. "fade" |
| duration_ms | INT | Computed scene duration |
| audio_path | TEXT | Storage path for narration audio |
| rendered_scene_path | TEXT | Storage path for rendered video segment |
| render_hash | TEXT | SHA-256 prefix of render inputs (skip re-render if unchanged) |
| version | INT | Incremented on re-render |

---

## Service Architecture

All film services live under `src/services/film/`:

```
film/
├── project/
│   ├── create-film-project.ts    ← Creates film_projects row
│   └── build-scenes.ts           ← Maps album pages → film_scenes
├── narration/
│   ├── elevenlabs.ts             ← ElevenLabs TTS wrapper
│   └── generate-voice-samples.ts ← A/B voice sample generation
├── render/
│   ├── render-scene.ts           ← Single scene → video segment
│   ├── render-selected-scenes.ts ← Batch render with hash-based skip
│   └── assemble-film.ts          ← Concatenate scenes → final video
├── storage/
│   └── film-storage.ts           ← Upload/download/delete film assets
└── utils/
    ├── build-narration-text.ts   ← Album text → narration-friendly text
    ├── compute-scene-duration.ts ← Audio duration → scene duration
    └── build-render-hash.ts      ← Deterministic hash for render caching
```

## Voice Sample Generation (implemented)

### Flow
1. Admin clicks "צור דגימות קול" in the Film panel
2. `POST /api/admin/orders/[orderId]/film/voice-samples` is called
3. Server fetches the first available album page text (up to 300 chars) as the sample
   - Falls back to a static Hebrew sample sentence if no pages exist yet
4. ElevenLabs TTS is called in parallel for `ELEVENLABS_VOICE_ID_A` and `ELEVENLABS_VOICE_ID_B`
5. Both MP3s are uploaded to film storage
6. `film_projects` is updated: `voice_sample_a_path`, `voice_sample_b_path`, `voice_sample_a_voice_id`, `voice_sample_b_voice_id`, `voice_choice_status = 'samples_ready'`
7. Admin hears both samples via HTML audio players and clicks "בחר קול זה"
8. `POST /api/admin/orders/[orderId]/film/select-voice` with `{ voiceId }` sets `selected_voice_id` and `voice_choice_status = 'chosen'`

### Storage paths
```
films/{orderId}/{filmProjectId}/voice-samples/sample-a.mp3
films/{orderId}/{filmProjectId}/voice-samples/sample-b.mp3
```

### API routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/orders/[orderId]/film` | POST | Create film project |
| `/api/admin/orders/[orderId]/film/voice-samples` | POST | Generate A/B voice samples |
| `/api/admin/orders/[orderId]/film/select-voice` | POST | Persist chosen voice |

### ElevenLabs model
`eleven_multilingual_v2` — supports Hebrew natively.

### Duration estimates
ElevenLabs does not return audio duration in the TTS response. Duration is estimated at ~2.5 words/second. This is refined later when scene rendering computes actual audio lengths.

## TTS Pronunciation Overrides (implemented)

Admin can define per-project pronunciation fixes to correct how names and places are spoken in the film narration, without changing the printed album text.

### Key rule
TTS overrides **never modify** `source_text`, `narration_text`, or any album page content. They are applied only when text is passed to ElevenLabs at TTS generation time.

### Storage
- Column: `film_projects.tts_overrides_json` (JSONB, nullable)
- Shape: `[{ "original": "בארי", "spoken": "בְּאֵרִי" }, ...]`
- Migration: `00026_add_tts_overrides.sql`

### Application point
`src/services/film/utils/apply-tts-overrides.ts` — `applyTtsOverrides(text, overrides)`. Uses exact string replacement (no regex) to avoid injection risks and accidental substitutions. Empty `original` values are silently skipped.

Currently wired into voice sample generation (`generate-voice-samples.ts`). Future scene narration generation should also call `applyTtsOverrides` before any TTS call.

### API routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/orders/[orderId]/film/tts-overrides` | GET | Fetch current overrides |
| `/api/admin/orders/[orderId]/film/tts-overrides` | PATCH | Save overrides `{ overrides: TtsOverride[] }` |

### Admin UI
The **"תיקוני הגייה"** section in the Film panel (`FilmPanel.tsx` + `TtsOverridesEditor.tsx`):
- Shows editable rows: Original term → Spoken form
- "הוסף תיקון" adds a blank row
- "שמור תיקונים" calls PATCH; empty `original` rows are stripped before saving
- Saves first, then regenerate voice samples to hear the corrected pronunciation

## Scene Generation (implemented)

### What a Film Scene Represents
A film scene maps to one logical "spread" from the album — typically a 2-page pair that will be shown together in the video with narration and motion effects. Special pages (cover, dedication, back_cover) become standalone scenes.

### How Scenes Are Generated
1. Admin clicks "בנה סצנות" in the Film panel
2. `POST /api/admin/orders/[orderId]/film/build-scenes` is called
3. Server loads all album pages for the order, ordered by `page_number`
4. Special pages (cover, dedication, back_cover) become standalone scenes
5. Content pages are paired into 2-page spreads (matching the album preview logic)
6. Each scene gets:
   - `source_text` — concatenated `text_content` from its pages
   - `narration_text` — whitespace-normalized version (via `buildNarrationText`)
   - `duration_ms` — estimated from text length (~2.5 words/sec Hebrew speech rate)
   - `page_spread_key` — e.g. "cover", "spread_01", "back_cover"
   - `page_ids_json` — array of page UUIDs in this scene
   - Default motion/transition: `ken_burns` / `fade`
7. Film project status is updated to `scenes_built`

### Idempotency
Scene generation is safe to run multiple times. Old scenes are deleted before new ones are inserted.

### Duration Estimation
`estimateSceneDurationFromText(narrationText)` uses a word-count heuristic:
- Hebrew speech rate: ~2.5 words/second
- Minimum: 3 seconds
- Padding: 1.5 seconds after estimated speech
- Default (no text): 5 seconds

This is only an initial estimate. Actual duration will be refined when real audio is generated.

### Limitations
- No AI rewriting of narration text — only whitespace normalization
- Duration is a rough estimate until real audio exists
- No audio generation in this phase
- No rendering in this phase

### API route
| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/orders/[orderId]/film/build-scenes` | POST | Generate scenes from album pages |

## Scene Rendering (queue + worker model)

### Why rendering cannot run on Vercel

Remotion rendering requires:
- A Node.js process with **headless Chrome** (Puppeteer)
- A **pre-built Remotion bundle** on disk (`.remotion-bundle/`)
- Significant CPU/RAM for video encoding

Vercel serverless functions have none of these. Rendering must run on a
local machine, VPS, or EC2 instance.

### Architecture: Queue + Worker

The render flow is split into two parts:

1. **Vercel (admin routes)** — validates input, marks scenes as `queued`
2. **Render worker** — standalone Node.js process that picks up queued scenes, renders them with Remotion, uploads outputs, and updates DB status

```
Admin UI  →  POST /film/render-scene(s)  →  film_scenes.status = "queued"
                                                      ↓
                                            render worker (local/VPS)
                                                      ↓
                                            status = "rendering" → "rendered" | "error"
```

### Scene Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Scene created, not yet queued |
| `queued` | Marked for rendering by admin, waiting for worker |
| `rendering` | Worker has picked it up and is actively rendering |
| `narration_ready` | TTS audio generated (future) |
| `rendered` | Video + thumbnail uploaded successfully |
| `error` | Render failed — see `error_message` |

### How to queue renders (admin)

1. Open the Film panel for an order in `/admin/orders/[orderId]`
2. Select scenes with checkboxes → click "הוסף N סצנות לתור רינדור"
3. Or click ▶ on individual scenes
4. Scenes move to `queued` status immediately
5. The admin UI shows `בתור` (queued) and `מרנדר` (rendering) badges

### How to run the render worker

```bash
# Prerequisites:
#   1. Chrome installed
#   2. Remotion bundle built
npm run bundle:remotion

#   3. Environment vars set (uses .env.local automatically)
#      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Process all queued scenes once, then exit
npm run render-worker

# Process specific scene IDs
npx tsx scripts/render-worker.ts <sceneId1> <sceneId2>

# Poll mode — check for queued scenes every 30s
npm run render-worker:poll
```

### API Routes

| Route | Method | Body | Description |
|-------|--------|------|-------------|
| `/api/admin/orders/[orderId]/film/render-scene` | POST | `{ sceneId: string }` | Queue single scene |
| `/api/admin/orders/[orderId]/film/render-scenes` | POST | `{ sceneIds?: string[] }` | Queue batch (all changed if omitted) |

These routes **do not** perform rendering. They validate inputs and set `status = "queued"`.

### Render worker internals

The worker (`scripts/render-worker.ts`) runs outside Vercel:

1. Queries `film_scenes` for `status = "queued"`
2. For each scene: sets `status = "rendering"`, calls `renderScene()` from `src/services/film/render/render-scene.ts`
3. `renderScene()` resolves page images → builds composition → calls Remotion `renderMedia()` + `renderStill()` → uploads to Supabase storage → sets `status = "rendered"`
4. On failure: sets `status = "error"` with `error_message`

### Remotion Composition

`src/remotion/SceneComposition.tsx` — registered as `id: "Scene"` (1920×1080, 30fps default):
- **Ken Burns motion**: `interpolate()` on `useCurrentFrame()` — scale 1.0→1.08, 2% pan over scene duration
- **Fade transitions**: 15-frame (0.5s) opacity envelope on both ends
- **RTL text overlay**: Hebrew font stack, `direction: rtl`, gradient background from bottom

### Storage Paths

```
films/{orderId}/{filmProjectId}/scenes/{sceneId}/scene.mp4
films/{orderId}/{filmProjectId}/scenes/{sceneId}/thumbnail.jpg
```

### Render Hash Caching

`buildRenderHash()` computes a 16-char SHA-256 prefix from: `narrationText`, `voiceId`, `motionPreset`, `transitionIn`, `transitionOut`, `pageIds`. The batch queue route skips scenes whose hash matches the stored value and status is `rendered`.

---

## Pipeline Status

1. **Create film project** — implemented
2. **Build scenes** — implemented
3. **Voice selection** — implemented (A/B samples, admin picks)
4. **TTS overrides** — implemented (pronunciation fixes)
5. **Generate narration** — not yet implemented (per-scene TTS)
6. **Render scenes** — implemented (queue + external worker; see above)
7. **Assemble film** — not yet implemented
8. **Deliver** — not yet implemented

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| ELEVENLABS_API_KEY | Yes (for narration) | ElevenLabs API key |
| ELEVENLABS_VOICE_ID_A | No | Default voice A for samples |
| ELEVENLABS_VOICE_ID_B | No | Default voice B for samples |
| FILM_DEFAULT_FPS | No (default: 30) | Video frame rate |
| FILM_DEFAULT_WIDTH | No (default: 1920) | Video width in pixels |
| FILM_DEFAULT_HEIGHT | No (default: 1080) | Video height in pixels |
| FILM_STORAGE_BUCKET | No (default: "films") | Supabase storage bucket name |
| INNGEST_EVENT_KEY | No | For future background job orchestration |
| INNGEST_SIGNING_KEY | No | For future background job orchestration |
| INNGEST_DEV | No | Enable Inngest dev mode |

## Admin UI

The Film section appears on the admin order detail page (`/admin/orders/[orderId]`), below the story section. It shows:

- Film project status, narration mode, motion style, selected voice
- Scene count, estimated total duration, and render progress summary
- Voice samples section: generate A/B samples, play audio, select voice
- TTS pronunciation overrides editor
- Action buttons: Build scenes, Render scenes (placeholder), Assemble film (placeholder)
- Scene list: each scene shows order number, spread key, text preview, estimated duration, status
- Empty state when no film project exists yet

Implemented actions: Create film project, Build scenes, Generate voice samples, Select voice, TTS overrides.

## Migration

```bash
# Apply locally
npx supabase db push

# Or run the migration manually
psql -f supabase/migrations/00025_add_film_tables.sql
```

No changes to existing tables. No changes to the order state machine. Safe to deploy alongside existing album functionality.
