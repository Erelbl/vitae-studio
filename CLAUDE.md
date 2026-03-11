# Vitae Studio - Claude Code Context

## What This Project Is
Premium web app for creating personalized "life story in rhymes" illustrated albums. Hebrew-first. Customers fill questionnaire → AI asks follow-up questions → customer uploads photos → AI generates rhyming story + watercolor illustrations → admin reviews (with version history) → PDF exported.

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

## Common Tasks
- **Add new questionnaire step**: Edit `src/components/questionnaire/`, update Zod schema in `src/lib/validation/questionnaire.ts`, add translations in `src/messages/he.json`
- **Modify story prompt**: Edit `src/services/story/claude-provider.ts` AND update `generation_settings` row
- **Modify illustration prompt**: Edit `src/services/illustration/gemini-provider.ts` AND update `generation_settings` row
- **Add new order status**: Update `src/lib/state-machine.ts` + `src/types/order.ts`, add migration for check constraint
- **Add shadcn component**: `npx shadcn@latest add [component]`

## Environment Variables
See `.env.example` for all required variables. Key ones:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
- `STORY_PROVIDER` (claude), `ILLUSTRATION_PROVIDER` (gemini)

## Testing the PDF
Visit `/api/pdf-test` to generate a test Hebrew PDF. This is the proof-of-concept for Hebrew RTL rendering.
