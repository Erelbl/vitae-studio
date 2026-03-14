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

## Intended Pipeline (future)

1. **Create film project** — admin clicks button, creates `film_projects` row
2. **Build scenes** — reads album pages, groups into spreads, creates `film_scenes`
3. **Generate narration** — for each scene, build narration text → ElevenLabs TTS → store audio
4. **Voice selection** — generate A/B samples, admin picks preferred voice
5. **Render scenes** — for each scene, combine images + motion + audio → video segment
6. **Assemble film** — concatenate all scene segments, mix music → final video
7. **Deliver** — store final video, generate thumbnail, make available to customer

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
- Scene count and render progress summary
- Action buttons: Create project, Build scenes, Generate voice samples, Render scenes, Assemble film
- Empty state when no film project exists yet

Only the "Create film project" action is wired to an API route. Other buttons show placeholder messages.

## Migration

```bash
# Apply locally
npx supabase db push

# Or run the migration manually
psql -f supabase/migrations/00025_add_film_tables.sql
```

No changes to existing tables. No changes to the order state machine. Safe to deploy alongside existing album functionality.
