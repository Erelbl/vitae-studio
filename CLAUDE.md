# Vitae Studio - Claude Code Context

## What This Project Is
Premium web app for creating personalized "life story in rhymes" illustrated albums. Hebrew-first. Customers fill questionnaire → AI asks follow-up questions → customer uploads photos → AI generates rhyming story + watercolor illustrations → admin assigns illustrations to pages → admin reviews (with version history) → PDF exported.

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui
- Supabase (Postgres, Storage, Auth, Realtime)
- @react-pdf/renderer for PDF generation
- Claude API for story generation + follow-up questions (via `STORY_PROVIDER=claude`)
- Gemini API (Nano Banana) for image stylization (via `ILLUSTRATION_PROVIDER=gemini`)
- next-intl for i18n messages (Hebrew-first, no locale routing in MVP)
- Zod v4 for validation (import from `zod/v4`)
- react-hook-form for forms
- Resend for email
- Vercel for hosting

## Architecture Decisions
- **Monolith**: Single Next.js app serves customer + admin
- **No customer auth**: Orders accessed via secure token links (`/order/[uuid]/preview?token=...`)
- **Background jobs (MVP)**: `processing_jobs` table for tracking + inline execution from API routes. No webhook/Edge Function orchestration yet — simplest reliable approach. Admin re-triggers if a batch stalls
- **Real-time**: Supabase Realtime Postgres Changes for live progress
- **Provider pattern**: `src/services/{service}/types.ts` + `{provider}-provider.ts` + `index.ts`
- **Versioning**: Every text/illustration regeneration creates a `page_versions` row. `page_versions.content` is a single text column — for text versions it holds the literal text, for illustration versions it holds the storage path. `version_type` disambiguates. Do not refactor this in MVP
- **Prompt tracking**: `generation_settings` table stores full prompt + model + params snapshots. Every `processing_job` links to its settings for reproducibility
- **generation_settings resolution rule**: prefer the active order-specific row for the given `order_id` + `setting_type`; fall back to the active global row (`order_id IS NULL`) for that `setting_type`. If multiple active rows exist for the same scope and type, that is a configuration error — throw, do not silently pick one. See `src/lib/generation-settings.ts`
- **Privacy**: Customer preview links use expiring access tokens (30 days, no auto-renewal). Admin can regenerate tokens. Storage URLs are short-lived Supabase signed URLs generated server-side after token validation. See `src/lib/access-token.ts`
- **Follow-up enrichment flow**: The transition `questionnaire_complete → enrichment_complete` is always the single path, regardless of whether follow-up succeeded, was skipped, or failed. The enrichment API route handles all three cases and always lands at `enrichment_complete`. No intermediate `generating_followup` state in MVP

## Key Patterns
- **State machine** for orders: see `src/lib/state-machine.ts`. Always use `assertTransition()` before changing order status. State `enrichment_complete` is reached from `questionnaire_complete` via the enrichment route, whether follow-up succeeded, was skipped, or failed — never blocked
- **Zod schemas** for all validation: `src/lib/validation/`. Import from `zod/v4`
- **Supabase clients**: `src/lib/supabase/{client,server,admin}.ts` — use `client.ts` in browser, `server.ts` in Server Components, `admin.ts` (service role) in API routes
- **Access tokens**: `src/lib/access-token.ts` — `generateAccessToken()`, `generateAccessTokenExpiry()`, `validateAccessToken()`. 30-day expiry, no auto-renewal, admin-regenerable
- **Photo upload**: Flexible gallery model, not rigid slots. Multi-upload, reorder, optional life-stage tagging. Photo-to-page mapping happens during generation, not upload
- **Version history**: `page_versions` table tracks all text/illustration versions per page. `pages.text_version` and `pages.illustration_version` hold the current version number
- **Generation settings**: `generation_settings` table. Check active settings before any AI call. Link every `processing_job` to its `generation_settings_id`
- All AI prompts stored in provider files AND tracked in `generation_settings` + `processing_jobs.input_data`

## Database
- Migrations in `supabase/migrations/`
- Generate types: `npx supabase gen types typescript --local > src/lib/supabase/types.ts`
- Key tables: orders, questionnaire_responses, photos, pages, page_versions, generation_settings, processing_jobs, admin_actions, profiles

## RTL/Hebrew
- **All Tailwind uses logical properties**: `ps-` not `pl-`, `pe-` not `pr-`, `me-` not `mr-`, `ms-` not `ml-`, `text-start` not `text-left`, `text-end` not `text-right`, `rounded-s-` not `rounded-l-`
- Root layout sets `dir="rtl"` `lang="he"`
- Fonts: Frank Ruhl Libre (serif, for album content), Heebo (sans-serif, for UI)
- Font CSS variables: `font-serif` = Frank Ruhl Libre, `font-sans` = Heebo
- No locale-prefixed URL routing in MVP. Just `next-intl` message files + `useTranslations()`

## File Organization
- Pages: `src/app/`
- API routes: `src/app/api/`
- Components: `src/components/{domain}/`
- Services: `src/services/{service}/`
- Shared logic: `src/lib/`
- Hooks: `src/hooks/`
- Types: `src/types/`
- i18n messages: `src/messages/{locale}.json`
- Database migrations: `supabase/migrations/`

## Album Page Editor (admin)
- Location: `/admin/orders/[id]/preview` — shown as "עריכת עמודים" section below the album preview
- Component: `src/components/admin/AlbumPageEditor.tsx` — client component with page selector + per-page editor
- Per-page editor: text area (auto-saves on blur or explicit save button), layout picker, image slot editors
- Text edits: saved to `pages.text_content`; a new `page_versions` row is created (`created_by='admin_edit'`), `text_version` increments, `admin_text_override=true`
- Layout edits: saved immediately to `pages.layout_type`
- Image slot edits: saved to `page_images` table via `PUT /api/admin/orders/[id]/pages/[pageId]/images`
- Crop/zoom: drag inside the mini-frame preview or use the zoom slider; saved on pointer-up via `PATCH` to images endpoint

## Layout System
- `pages.layout_type` TEXT column (default: `FULL_IMAGE`). Values: `FULL_IMAGE`, `TEXT_ONLY`, `IMAGE_TOP_TEXT_BOTTOM`, `TEXT_TOP_IMAGE_BOTTOM`, `IMAGE_LEFT_TEXT_RIGHT`, `TWO_IMAGES`
- `FULL_IMAGE`: illustration fills page, text overlaid at bottom with gradient
- `IMAGE_TOP_TEXT_BOTTOM` / `TEXT_TOP_IMAGE_BOTTOM`: 60/40 split between image and text
- `IMAGE_LEFT_TEXT_RIGHT`: 55/45 split (forced `dir=ltr` for physical positioning)
- `TWO_IMAGES`: two equal slots side by side (slot 1 = left, slot 2 = right), optional text caption
- `TEXT_ONLY`: no image, centered text only

## page_images Table
- New table for slot-based image assignment: `page_id`, `photo_id`, `slot` (1 or 2), `crop_x`, `crop_y`, `scale`
- Unique constraint: `(page_id, slot)` — max 1 image per slot per page
- `crop_x`/`crop_y`: 0-1 float (0 = left/top edge, 1 = right/bottom edge) — pan within scaled image
- `scale`: ≥1 float — zoom level (1 = fill frame exactly, 2 = 2× zoom)
- API: `PUT /api/admin/orders/[id]/pages/[pageId]/images` — upsert/delete slot
- API: `PATCH /api/admin/orders/[id]/pages/[pageId]/images` — update crop/zoom only
- Legacy fallback: if `page_images` is empty, preview renders `pages.illustration_storage_path` as slot 1

## Illustration Assignment (legacy + new)
- Legacy: `PUT /api/admin/orders/[orderId]/pages/[pageId]/assign-illustration` with `{ photoId }` — copies photo path directly to `pages.illustration_storage_path`. Component: `IllustrationPageMapper`
- New system: `page_images` table (via AlbumPageEditor). New system takes priority in rendering
- Backward compat: existing pages with `pages.illustration_storage_path` still render as FULL_IMAGE slot 1 fallback

## Album Preview Architecture
- `AlbumPreview` (`src/components/album/AlbumPreview.tsx`): groups pages into 2-page spreads, open-book spine shadow, navigation
- `AlbumPageView` (`src/components/album/AlbumPageView.tsx`): all page types are `aspect-square` (25×25 cm). Dispatches on `page_type`, then on `layout_type` for content pages
- `ImageFill` helper: absolute-positioned img with `width = scale*100%`, `left = -crop_x*(scale-1)*100%`, `top = -crop_y*(scale-1)*100%` — renders crop/zoom via CSS
- Text overlay: `bg-gradient-to-t from-black/72` with no opaque box
- Mock fallback: if no real pages exist, `loadPreviewData` returns 40-page sample (`isMock: true`)

## Admin Order Deletion
- **Route**: `DELETE /api/admin/orders/[orderId]/delete` — admin-only, requires `role=admin` in `app_metadata`
- **DB cascade**: Deleting the `orders` row cascades to all related records: `pages` → `page_images`, `page_versions`; also `photos`, `processing_jobs`, `generation_settings`, `questionnaire_responses`, `admin_actions`
- **Storage cleanup**: The route collects all `original_storage_path` (originals bucket) and `illustration_storage_path` values from `photos` and `page_versions` before deletion, then removes them. Storage errors are reported in the response but do not block DB deletion
- **UI**: `DeleteOrderButton` component (`src/components/admin/DeleteOrderButton.tsx`) — shows confirmation AlertDialog listing what will be deleted. Available on the admin dashboard (per row) and the order detail header
- **Safety**: Always show confirmation dialog. Irreversible. No soft-delete or recycle bin in MVP

## Common Tasks
- **Add new questionnaire step**: Edit `src/components/questionnaire/`, update Zod schema in `src/lib/validation/questionnaire.ts`, add translations in `src/messages/he.json`
- **Modify story prompt**: Edit `src/services/story/claude-provider.ts` AND update `generation_settings` row
- **Modify illustration prompt**: Edit `src/services/illustration/gemini-provider.ts` AND update `generation_settings` row
- **Add new order status**: Update `src/lib/state-machine.ts` + `src/types/order.ts`, add migration for check constraint
- **Add shadcn component**: `npx shadcn@latest add [component]`

## Film Product (Foundation)
- **Tables**: `film_projects` (one per order) + `film_scenes` (many per film project). Migration: `00025_add_film_tables.sql`
- **Types**: `src/types/film.ts` — `FilmProject`, `FilmScene`, status/mode/style enums
- **Env helper**: `src/lib/film-env.ts` — server-only, lazy access, fail-fast for required vars
- **Services**: `src/services/film/` — project, narration, render, storage, utils modules (skeletons with TODOs)
- **Admin UI**: `FilmPanel` component on admin order detail page. Only "Create film project" is wired to API
- **API routes**: `POST /api/admin/orders/[orderId]/film` (create), `/film/voice-samples` (generate A/B samples), `/film/select-voice` (persist choice)
- **ElevenLabs TTS**: `src/services/film/narration/elevenlabs.ts` — real implementation using `eleven_v3`
- **TTS overrides**: `film_projects.tts_overrides_json` (JSONB) + `src/services/film/utils/apply-tts-overrides.ts`. Applied at TTS time only — never modifies stored album/narration text. Admin edits via "תיקוני הגייה" section in Film panel
- **Voice samples**: `src/services/film/narration/generate-voice-samples.ts` — fetches album text as sample, generates 2 MP3s, uploads to `films/{orderId}/{filmProjectId}/voice-samples/`
- **Docs**: `docs/film-product.md` — full technical reference for the Film foundation
- No changes to existing order statuses or album flow

## Film Render Worker

Film rendering runs outside Vercel (requires Chrome + Remotion). The admin queues scenes via the Film panel; the render worker picks them up.

### One-time setup (local machine)
```bash
# 1. Build the Remotion bundle (run once, or after changing src/remotion/)
npm run bundle:remotion

# 2. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

### Running the worker

```bash
# Watch mode — polls every 30s, picks up scenes as admin queues them. Keep this running.
npm run render-worker:watch

# Single-run — process all currently queued scenes, then exit (useful for CI or testing)
npm run render-worker

# Custom poll interval
npx tsx scripts/render-worker.ts --poll 60
```

### Worker behavior
- **Startup**: resets any scenes stuck in `rendering` (>30 min old) back to `queued`
- **Idle heartbeat**: logs "Idle — waiting for queued scenes." once per minute when nothing is queued
- **Failures**: a failed scene is marked `error` in the DB; the loop continues with remaining scenes
- **Periodic stale recovery**: re-runs the stale-scene check every 10 minutes
- **Graceful shutdown**: responds to SIGTERM (e.g. from a process manager)

### Bundle path
- Standard bundle path: `.remotion-bundle/` (matches `--out-dir` in `package.json`)
- Default lookup: `render-scene.ts` checks `REMOTION_BUNDLE_PATH` env var, falls back to `<cwd>/.remotion-bundle/`
- Validation: checks for `index.html` inside the bundle directory
- Override: set `REMOTION_BUNDLE_PATH` in `.env.local` to an absolute path

### Scene animation
Scenes render using the actual album page layout as the visual base — not a generic template. Each of the 9 layout types produces a visually distinct scene.

**Image reveal** (3-phase drawing effect):
The image reveals progressively, simulating an illustration being created live. The **final frame is pixel-identical to the original album illustration** — no permanent filters or style changes.

- **Phase A — Outline sketch** (0–30% of reveal): High contrast + full grayscale creates a pencil-edge look. A directional mask sweeps in from the right (Hebrew reading direction) combined with a soft radial vignette
- **Phase B — Color fill** (30–92% of reveal): Contrast eases back to normal, grayscale fades to full color, radial mask expands to full coverage. The image "fills in" with color like watercolor paint
- **Phase C — Stable** (92–100% of reveal): All CSS filters removed. Image is the unmodified original artwork
- Reveal completes at 55% of scene duration (`IMAGE_REVEAL_END_FRAC`)
- All effects are CSS-only (filter + mask), deterministic, no AI generation

**Text reveal** (narration-synced writing effect):
- Word-by-word fade-in: each word's opacity transitions from 0→1 in sequence
- Words overlap slightly (0.8 word-units each) for a smooth flowing reveal
- Whitespace/newlines always visible so the text block never shifts during reveal
- RTL-safe: inline `<span>`s flow naturally in Hebrew reading order
- **Narration sync**: when `narrationDurationMs` is available (from `audio_duration_ms` on the scene), text reveal is timed to match narration pacing — words distributed across the narration window starting at 8% into the scene. Falls back to visual-only timing (15%–65% of scene) when no narration data exists
- Works with all text overlay types (bottom/top/center gradient, split block, text-only)

**Ken Burns**: subtle 5% zoom over full scene duration (reduced from 8% for premium feel)

**Fade + storybook slide-in** (entry transition):
- 15-frame opacity fade-in combined with a 22-frame Y-translate (14px, ≈1.3% of height)
- Scene content eases up from slightly below while fading in — a "page being turned" feel
- Exit is a clean fade-out only (no translate on exit)
- Only active when `transitionIn === "fade"`

**Text parallax** (depth separation):
- On `ken_burns` scenes, text overlays counter-drift subtly vs the image zoom
- Bottom/center overlays drift upward (−6px over the scene), top overlays drift downward (+6px)
- Creates a sense of the text sitting on a separate "glass plate" above the illustration
- No parallax on `static` motion preset

**Ambient luminance breath**:
- After image reveal completes (Phase C only), a very slow sinusoidal ±1.5% brightness variation
- One complete cycle over the full scene duration (period = scene length)
- Gives the illustration a gentle sense of life — like soft sunlight shifting
- Applied as a CSS `brightness()` filter; deterministic per-frame

**Cinematic vignette**:
- Static radial gradient overlay on all full-image layouts (FULL_IMAGE, FULL_IMAGE_TEXT_TOP/CENTER)
- `rgba(0,0,0,0.18)` at edges fading to transparent at 50% — a soft natural lens falloff
- Draws attention to the center of the illustration; zIndex 5 (above image, below text)
- Not animated; single AbsoluteFill div, no performance impact

**Limitations**:
- No word-level timestamps from TTS yet — text sync uses uniform word distribution across narration duration
- Image reveal uses CSS filters only; some very dark or very bright illustrations may look less convincing during Phase A sketch effect
- Advanced character animation (faces, hands, blinking, etc.) is future work
- All motion is render-time only — no stored album data is ever modified

### Logs
Timestamps on every line. Example:
```
[2025-03-15 10:00:00] [render-worker] Watch mode: polling every 30s. Ctrl+C to stop.
[2025-03-15 10:00:31] [render-worker] Found 2 queued scene(s).
[2025-03-15 10:00:31] [render-worker] Rendering scene abc123...
[2025-03-15 10:01:45] [render-worker] Scene abc123 rendered → films/.../scene.mp4
[2025-03-15 10:01:46] [render-worker] Done. Rendered: 2, Failed: 0
[2025-03-15 10:02:16] [render-worker] Idle — waiting for queued scenes.
```

## Environment Variables
See `.env.example` for all required variables. Key ones:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
- `STORY_PROVIDER` (claude), `ILLUSTRATION_PROVIDER` (gemini)
- Film-specific: `ELEVENLABS_API_KEY`, `FILM_DEFAULT_FPS`, `FILM_DEFAULT_WIDTH`, `FILM_DEFAULT_HEIGHT`, `FILM_STORAGE_BUCKET` (see `src/lib/film-env.ts`)

## Testing the PDF
Visit `/api/pdf-test` to generate a test Hebrew PDF. This is the proof-of-concept for Hebrew RTL rendering.
