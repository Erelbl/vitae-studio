# Vitae Studio - Complete Technical Architecture Plan

## Context

We are building a premium web-based product for creating personalized "life story in rhymes" illustrated albums. A customer fills out a questionnaire about a person's life, uploads real photos, and the system generates Hebrew rhyming story text + watercolor-style illustrations (image-to-image, NOT text-to-image). An admin reviews and approves before PDF export. The MVP targets Hebrew-speaking customers in Israel, 5-10 orders/month at 2000-5000 ILS.

---

## 1. Product Architecture Overview

Five major subsystems connected through Supabase:

- **A. Customer-Facing Web App** (Next.js on Vercel) - Landing page, questionnaire wizard, AI follow-up enrichment, photo upload gallery, album preview
- **B. Admin Dashboard** (same Next.js app, `/admin` routes) - Order management, page-by-page review with version history, regeneration triggers, approval workflow
- **C. AI Processing Pipeline** - Story text generation (Claude API), AI follow-up questions (Claude API), image stylization (Gemini/Nano Banana API), PDF generation
- **D. Storage Layer** (Supabase Storage) - Original photos, stylized illustrations (versioned), generated PDFs
- **E. Data Layer** (Supabase Postgres + Realtime) - All entities, state machine, generation history, audit trail

**How they connect:** Next.js API routes handle all operations. Long-running AI tasks (story generation, illustration batches) are tracked via a `processing_jobs` table. In MVP, processing is triggered inline from API routes — no webhook or Edge Function orchestration yet. The jobs table provides tracking, retry logic, and audit trail. Supabase Realtime pushes status updates to the browser.

---

## 2. Recommended System Architecture

### Monolith: Single Next.js App
At 5-10 orders/month with a solo developer, a monolith is the only rational choice. Admin dashboard lives under `/admin` routes protected by role-based middleware.

### API Design (Next.js App Router route handlers)
```
POST   /api/orders                              - create order
GET    /api/orders/[id]                          - get order details
PATCH  /api/orders/[id]                          - update order status
POST   /api/orders/[id]/questionnaire            - submit questionnaire
POST   /api/orders/[id]/followup                 - generate AI follow-up questions
POST   /api/orders/[id]/followup/respond         - submit follow-up answers
POST   /api/orders/[id]/photos                   - request upload URL
POST   /api/orders/[id]/generate-text            - trigger text generation
POST   /api/orders/[id]/generate-illustrations   - trigger illustration gen
POST   /api/orders/[id]/generate-pdf             - trigger PDF export
GET    /api/orders/[id]/pages                    - get album pages
PATCH  /api/orders/[id]/pages/[pageId]           - edit page text/illustration
GET    /api/orders/[id]/pages/[pageId]/versions  - get version history
POST   /api/admin/orders/[id]/approve            - admin approve
POST   /api/admin/orders/[id]/reject             - admin reject with notes
```

### Background Job Strategy (MVP — Simplified)

The `processing_jobs` table exists from day one for tracking, auditing, and retry. But the **execution model is deliberately simple for MVP**:

1. **Story generation** (~30-60s): Run inline in the API route that triggers it. The route creates a job row, calls Claude synchronously, updates the job to completed/failed, and returns. Vercel's function timeout (60s on Hobby, 300s on Pro) is sufficient.

2. **Illustration generation** (~30-60s per image x 40 pages): Triggered via an API route that processes images **sequentially in a loop**, updating each job row and the corresponding page record as it goes. This will take 20-40 minutes total. Two options for MVP:
   - **Option A (simplest):** Admin triggers generation from the dashboard. A Vercel Pro function (300s max with streaming, or longer with Fluid Compute) processes images in batches. If it times out, the admin re-triggers and it resumes from unprocessed jobs. The jobs table tracks which pages are done.
   - **Option B (if Option A proves unreliable):** Move to a Supabase Edge Function invoked once via a simple `fetch()` from the API route. The Edge Function processes all pending illustration jobs sequentially.

3. **PDF generation** (~30-90s): Run inline in API route. Well within timeout limits.

**The key insight:** At 5-10 orders/month, the admin is already in the loop. If illustration generation stalls, the admin simply re-triggers. The jobs table makes this safe and idempotent — already-completed pages are skipped. We graduate to webhook-based or queue-based orchestration only when manual re-triggering becomes annoying.

### Real-Time Updates
Supabase Realtime Postgres Changes. The client subscribes to the `pages` table filtered by order ID. As each illustration job completes and updates the page row, the UI reflects progress automatically.

### Authentication
- **Customers: No login required.** Orders accessed via secure token links (see Section 19: Privacy & Access).
- **Admin:** Supabase Auth email/password. `profiles` table with `role` column. Middleware checks `role === 'admin'` for `/admin/*` routes.

---

## 3. MVP Scope vs Future Scope

### MVP (In)
- Landing page with order CTA
- Multi-step questionnaire (8 steps about the person's life)
- **AI follow-up enrichment step** — after questionnaire, Claude generates 3-5 targeted follow-up questions to fill gaps; customer answers on a single additional page
- **Flexible photo upload gallery** — multi-upload, drag-to-reorder, optional life-stage tagging (no rigid slot grid)
- AI story generation in Hebrew (40 pages, 2-4 rhyming lines each)
- Image-to-image watercolor stylization of uploaded photos
- Digital album preview (paginated browser view)
- Admin dashboard: order list, page-by-page review with version history, text editing, regeneration
- Admin approval flow
- PDF export (40 pages, RTL Hebrew, one illustration + text per page)
- Manual payment tracking (admin marks as paid)
- Email notifications (order received, preview ready, delivered)
- **Secure preview links** with expiring access tokens
- **Version history** for regenerated text and illustrations

### Future (Out)
- Customer accounts/login
- Online payment gateway
- Full conversational AI interview (beyond single follow-up step)
- Multiple illustration styles
- Multi-illustration pages
- English/multilingual routing
- Video/narrated album export
- Customer self-editing of album content
- Print vendor integration
- Analytics dashboard
- Coupon/discount system

---

## 4. Core User Flows

### Landing -> Order Creation
1. Customer visits `/` -> hero section with sample pages, pricing, testimonials
2. Clicks "Start Your Album" -> system creates `order` with `status = 'created'`, generates UUID
3. Redirects to `/order/[uuid]/questionnaire`

### Questionnaire (8 steps, react-hook-form + zod)
1. About the Person: name, birth date, birth city, gender (affects Hebrew grammar), relationship to buyer
2. Childhood: where they grew up, siblings, memorable moments, hobbies
3. Youth & Education: schools, military service, formative experiences
4. Career & Life: profession, achievements, passions, defining moments
5. Family: partner, children, grandchildren, traditions
6. Character & Values: personality traits, favorite sayings, what they're known for
7. Special Requests: dedications, specific events, tone preference (humorous/emotional/mixed)
8. Buyer Details: name, email, phone, occasion (birthday, retirement, memorial)

Each step auto-saves. On completion -> `questionnaire_complete`.

### AI Follow-Up Enrichment
1. After questionnaire completion, system sends all responses to Claude
2. Claude analyzes for gaps, thin areas, or opportunities for richer storytelling
3. Claude returns 3-5 targeted follow-up questions (e.g., "You mentioned military service in the Golani brigade — what was a memorable moment from that time?")
4. Customer sees a single follow-up page with these questions
5. Customer answers (free text per question) and submits
6. Follow-up answers are appended to `questionnaire_responses.responses` under a `followup` key
7. Order transitions to `enrichment_complete` -> redirect to photos
8. **Skip option**: Customer can skip follow-up if they prefer

### Photo Upload (Flexible Gallery)
- **No rigid slot grid.** Customer sees an open upload area
- Multi-file upload (drag & drop or file picker), max 10MB per file, JPEG/PNG/HEIC/WebP
- Uploaded photos appear in a reorderable gallery grid
- Each photo has optional fields: life-stage tag (dropdown), caption (free text)
- Life-stage tags are suggestions, not required — untagged photos are fine
- Customer can reorder photos by dragging (determines initial page order)
- Minimum 10 photos required; no hard maximum (system uses up to 40 for album pages, extras are available for admin to swap in)
- Direct upload to Supabase Storage via signed URLs (client-side)
- On submit -> `photos_uploaded` -> redirect to status page
- **Photo-to-page mapping** happens during generation, not during upload. The system (and later the admin) decides which photos map to which album pages

### Generation & Preview
- Status page shows real-time progress via Supabase Realtime
- Text generation (~30-60s), then illustrations (~20-40 min total)
- Customer receives email when preview ready
- Preview at `/order/[uuid]/preview` via secure token (see Section 19)
- Paginated, swipeable pages
- No customer editing in MVP (contact via WhatsApp/email for changes)

### Payment (MVP - Manual)
- After preview, customer sees payment instructions (bank transfer / Bit / PayBox)
- Admin manually marks as paid

---

## 5. Admin Flows

### Order List (`/admin/orders`)
- Table: order date, person name, status badge, buyer name, paid status
- Filter by status, sort by date

### Order Detail (`/admin/orders/[orderId]`)
- Header: order info, status, buyer contact
- Questionnaire summary (read-only, includes follow-up answers)
- Photo gallery (originals)
- **Page-by-page album editor:**
  - Left: illustration — original photo, current stylized version, and previous versions (clickable to compare/restore)
  - Right: Hebrew text (editable textarea), with version history dropdown to compare/restore previous versions
  - Per-page actions: "Regenerate Text", "Regenerate Illustration", "Regenerate with Custom Prompt"
  - Each regeneration creates a new version; previous versions are preserved
- Bulk actions: "Regenerate All Text", "Regenerate All Illustrations"
- Order actions: "Approve", "Reject with Notes", "Export PDF", "Mark as Paid", "Mark as Delivered"
- **Generation settings panel**: View/edit the prompt templates and model settings used for this order

---

## 6. Data Model / Entities

### `orders`
```sql
id: uuid PK
created_at, updated_at: timestamptz
status: text (check constraint enum)
person_name, person_gender ('male'|'female'), person_birth_date: date
buyer_name, buyer_email, buyer_phone, occasion: text
language: text (default 'he')
total_pages: int (default 40)
payment_status: text ('pending'|'paid'|'refunded')
payment_amount: int (agorot), payment_method, payment_date
admin_notes, customer_notes: text
pdf_storage_path: text
delivered_at: timestamptz
access_token: text (unique, for secure preview links)
access_token_expires_at: timestamptz
-- Future video fields:
video_storage_path: text (nullable)
video_status: text (nullable)
```

### `questionnaire_responses`
```sql
id: uuid PK
order_id: uuid FK (unique, 1:1)
created_at, updated_at: timestamptz
responses: jsonb  -- all answers as structured JSON, schema defined in code via Zod
followup_questions: jsonb  -- AI-generated follow-up questions [{question, answer}]
is_complete: boolean
```
JSONB because questionnaire will evolve; no schema migrations needed for question changes.

### `photos`
```sql
id: uuid PK
order_id: uuid FK
created_at: timestamptz
original_storage_path, original_filename, mime_type: text
file_size_bytes, width, height: int
life_stage: text (nullable — tagging is optional)
  check (life_stage in ('baby','childhood','youth','military','career','wedding','family','recent','other') or life_stage is null)
display_order: int not null default 0
caption: text (optional)
```

### `pages`
```sql
id: uuid PK
order_id: uuid FK
page_number: int (1-40)
created_at, updated_at: timestamptz
photo_id: uuid FK (nullable for text-only pages)
text_content: text (Hebrew rhyming, 2-4 lines)
text_version: int not null default 1
text_status: text ('pending'|'generating'|'ready'|'approved')
illustration_storage_path: text
illustration_version: int not null default 1
illustration_status: text ('pending'|'generating'|'ready'|'failed'|'approved')
illustration_prompt: text
illustration_model: text
text_generation_model: text
admin_text_override: boolean (default false)
page_type: text ('illustration_and_text'|'text_only'|'cover'|'dedication'|'back_cover')
-- Future video fields:
narration_audio_path: text (nullable)
narration_duration_ms: int (nullable)
transition_type: text (default 'fade')
display_duration_ms: int (default 5000)
-- Composite unique: (order_id, page_number)
```

### `page_versions`
```sql
id: uuid PK
page_id: uuid FK -> pages
created_at: timestamptz not null default now()
version_type: text not null check (version_type in ('text', 'illustration'))
version_number: int not null
content: text  -- for text versions: the text content; for illustration: the storage path
generation_settings: jsonb  -- full snapshot: model, prompt, temperature, etc.
created_by: text  -- 'system', 'admin_edit', 'regeneration'
is_current: boolean not null default true
```
Every regeneration or admin edit creates a new row. The `is_current` flag marks the active version. Admin can restore any previous version by flipping `is_current`.

### `generation_settings`
```sql
id: uuid PK
order_id: uuid FK -> orders
created_at: timestamptz not null default now()
setting_type: text not null check (setting_type in ('story', 'illustration', 'followup'))
provider: text not null  -- 'claude', 'gemini', etc.
model_id: text not null  -- 'claude-sonnet-4-20250514', 'gemini-2.0-flash', etc.
system_prompt: text  -- full system prompt used
user_prompt_template: text  -- the template with {placeholders}
temperature: real
max_tokens: int
extra_params: jsonb  -- any provider-specific params (style, strength, etc.)
is_active: boolean not null default true  -- which settings are currently in use
notes: text  -- admin notes about why these settings were chosen
```
One row per setting configuration. When settings are updated, the old row gets `is_active = false` and a new row is created. Every `processing_job` references the `generation_settings.id` it was run with.

### `processing_jobs`
```sql
id: uuid PK
order_id: uuid FK, page_id: uuid FK (nullable)
generation_settings_id: uuid FK -> generation_settings (nullable)
created_at, started_at, completed_at: timestamptz
job_type: text ('generate_story'|'generate_page_text'|'generate_illustration'|'generate_followup'|'generate_pdf')
status: text ('pending'|'processing'|'completed'|'failed'|'retrying')
attempts: int (default 0), max_attempts: int (default 3)
error_message: text
input_data: jsonb  -- full input snapshot for reproducibility
output_data: jsonb  -- provider response metadata (tokens, timing, etc.)
priority: int (default 0)
```

### `admin_actions`
```sql
id: uuid PK
order_id: uuid FK, page_id: uuid FK (nullable)
created_at: timestamptz
admin_user_id: uuid FK -> auth.users
action_type: text ('approve'|'reject'|'edit_text'|'regenerate_text'|'regenerate_illustration'|'restore_version'|'update_settings'|'export_pdf'|'mark_paid'|'mark_delivered'|'add_note')
details: jsonb
```

### `profiles` (extends auth.users)
```sql
id: uuid PK FK -> auth.users
role: text ('admin')
display_name: text
```

### Key Indexes
```sql
idx_orders_status ON orders(status)
idx_orders_access_token ON orders(access_token)
idx_pages_order_id ON pages(order_id)
idx_photos_order_id ON photos(order_id)
idx_processing_jobs_status ON processing_jobs(status, created_at)
idx_page_versions_page_id ON page_versions(page_id)
UNIQUE idx_pages_order_page ON pages(order_id, page_number)
```

---

## 7. Order Status Machine

```
created
  -> questionnaire_complete (questionnaire submitted)
    -> enrichment_complete (follow-up answered or skipped)
      -> photos_uploaded (min 10 photos)
        -> generating_text (auto-trigger or admin trigger)
          -> text_ready | error_generation
            -> generating_illustrations (auto-trigger or admin trigger)
              -> preview_ready | error_generation
                -> admin_review (customer views, admin reviews)
                  -> approved | revision_requested
                    revision_requested -> generating_text | generating_illustrations | admin_review
                    approved -> generating_pdf
                      -> delivered | error_generation
error_generation -> generating_text | generating_illustrations | generating_pdf (admin retry)
```

Note: `enrichment_complete` is the new state after AI follow-up. The transition from `questionnaire_complete` can go directly to `enrichment_complete` if the customer skips follow-up.

Valid transitions enforced in `src/lib/state-machine.ts`.

---

## 8. Service Abstraction Design

Pattern: `types.ts` (interface) + `{provider}-provider.ts` (implementation) + `index.ts` (factory). Environment variable selects provider.

**Every provider call must include a `generation_settings_id`** reference so outputs are linked to the exact settings that produced them.

### Story Generation (`src/services/story/`)
- `StoryGenerationProvider` interface with `generateFullStory()` and `regeneratePageText()`
- `ClaudeStoryProvider` implementation using Claude API
- Input: questionnaire data (including follow-up answers), person details, language, photo descriptions
- Output: 40 pages of text + model/token metadata + prompt used

### Illustration (`src/services/illustration/`)
- `IllustrationProvider` interface with `stylizeImage()`
- `GeminiIllustrationProvider` implementation using Gemini API (Nano Banana)
- Input: source image URL, style, custom prompt, identity preservation flag, output dimensions
- Output: image buffer + model/prompt metadata

### Follow-Up Questions (`src/services/followup/`)
- `FollowUpProvider` interface with `generateFollowUps(questionnaireData) -> {questions: string[]}`
- `ClaudeFollowUpProvider` implementation — sends full questionnaire to Claude, asks it to identify 3-5 areas where more detail would improve the story
- MVP: single Claude call, returns an array of question strings

### Narration (`src/services/narration/`) - future
- `NarrationProvider` interface with `generateNarration()`

---

## 9. File / Storage Architecture

### Supabase Storage Buckets

| Bucket | Access | Path Pattern | Purpose |
|--------|--------|-------------|---------|
| `originals` | Private | `{order_id}/{photo_id}.{ext}` | Customer-uploaded photos |
| `illustrations` | Private | `{order_id}/{page_id}/v{version}.png` | AI-generated illustrations (versioned) |
| `exports` | Private | `{order_id}/album-{timestamp}.pdf` | Generated PDFs |
| `assets` | Public | `templates/{asset_name}.png` | Static assets (logo, borders, textures) |

All paths use UUIDs (never customer names/Hebrew filenames). Original filenames stored in DB only.

**Illustration versioning**: Each regeneration writes to a new versioned path (`v1.png`, `v2.png`, ...). Previous versions are never overwritten. The `pages.illustration_storage_path` always points to the current version. The `page_versions` table links to all versions.

### Upload Flow
1. Client requests a signed upload URL from API route
2. API route generates signed URL via `supabase.storage.createSignedUploadUrl()`
3. Client uploads directly to Supabase Storage (avoids Vercel function size limits)
4. Client notifies API of completion -> creates/updates `photos` record

---

## 10. Preview and PDF Generation Strategy

### In-Browser Preview
React component with CSS-based page layout (NOT PDF rendering in browser):
- Fixed aspect ratio container (A4 or custom album dimensions)
- Paper texture background, illustration image from signed URL
- Hebrew text with designated font, RTL direction
- Swipe/arrow pagination

### PDF Generation: `@react-pdf/renderer`
- React-based API, consistent with stack
- Custom font registration (Frank Ruhl Libre TTF for Hebrew)
- Flexbox layout, `direction: 'rtl'`, `textAlign: 'right'` on text elements
- Unicode bidi markers for mixed-direction text
- Runs server-side in Vercel API route

**CRITICAL: Hebrew PDF proof-of-concept completed in Phase 1.** Test endpoint at `/api/pdf-test`. If quality issues arise, fallback is Puppeteer-based PDF generation.

### Print Specs
- 300 DPI at print size (illustrations at 2480x3508 for A4 full-bleed)
- sRGB color space (CMYK conversion left to print vendor)
- 3mm bleed on all sides for professional printing

---

## 11. App Structure / Folder Architecture

```
vitae-studio/
├── .env.local, .env.example
├── CLAUDE.md                         # Claude Code context
├── README.md                         # Setup instructions
├── docs/
│   ├── architecture.md               # This plan
│   ├── state-machine.md
│   └── api.md
├── next.config.ts, tailwind.config.ts, tsconfig.json, package.json
├── public/fonts/ (FrankRuhlLibre TTF), public/images/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout (RTL, Hebrew)
│   │   ├── page.tsx                  # Landing page
│   │   ├── globals.css
│   │   ├── order/[orderId]/
│   │   │   ├── questionnaire/page.tsx
│   │   │   ├── followup/page.tsx     # AI follow-up questions
│   │   │   ├── photos/page.tsx
│   │   │   ├── status/page.tsx
│   │   │   └── preview/page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx            # Admin nav
│   │   │   ├── page.tsx              # Order list
│   │   │   └── orders/[orderId]/page.tsx
│   │   └── api/
│   │       ├── orders/...            # All order API routes
│   │       ├── admin/orders/...      # Admin action routes
│   │       └── webhooks/supabase/route.ts
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── landing/                  # hero, pricing, testimonials
│   │   ├── questionnaire/            # wizard + step components
│   │   ├── photos/                   # upload gallery, reorder, tagging
│   │   ├── album/                    # preview, page, navigation
│   │   └── admin/                    # order table, page editor, version history, status badge
│   ├── services/
│   │   ├── story/    (types.ts, claude-provider.ts, index.ts)
│   │   ├── illustration/ (types.ts, gemini-provider.ts, index.ts)
│   │   ├── followup/ (types.ts, claude-provider.ts, index.ts)
│   │   ├── pdf/      (generator.ts, album-document.tsx, fonts.ts)
│   │   └── email/    (types.ts, resend-provider.ts, templates/)
│   ├── lib/
│   │   ├── supabase/ (client.ts, server.ts, admin.ts, types.ts)
│   │   ├── state-machine.ts
│   │   ├── access-token.ts           # Preview link token generation/validation
│   │   ├── validation/ (questionnaire.ts, order.ts, photo.ts)
│   │   └── utils.ts
│   ├── hooks/ (use-order-realtime.ts, use-upload.ts, use-album-pages.ts)
│   └── types/ (order.ts, page.ts, questionnaire.ts, database.ts)
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── functions/
│   └── seed.sql
```

---

## 12. Risk Areas and Technical Pitfalls

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Identity preservation in watercolor stylization** | HIGH | Use Nano Banana Pro (best identity preservation), careful prompt engineering, admin review catches bad results, per-page regeneration with custom prompts |
| **Hebrew PDF rendering** | MEDIUM | Proof-of-concept completed. Frank Ruhl Libre TTF, test mixed-direction text. Fallback: Puppeteer-based PDF |
| **Hebrew rhyming poetry quality** | MEDIUM | Claude with detailed system prompt + examples. Admin can edit. Hebrew poet to review/refine prompts. The prompt IS the product |
| **Illustration generation timeout** | MEDIUM | Sequential processing with jobs table. Admin can re-trigger if it stalls. Completed pages are skipped on retry. Upgrade to Edge Functions later if needed |
| **Preview link privacy** | MEDIUM | Expiring access tokens (not bare UUIDs), signed URLs for images, tokens regenerable by admin |
| **Image upload size/format** | LOW | Client-side validation (10MB max), HEIC conversion, EXIF rotation |
| **Cost per order** | LOW | ~$3-$10 AI cost per album vs 2000+ ILS price. Excellent margins |
| **Prompt drift / irreproducibility** | LOW | Full prompt and settings snapshot stored per job. `generation_settings` table tracks all configurations |

---

## 13. Implementation Phases

### Phase 1: Foundation (Weeks 1-2) ✅ COMPLETE
- Initialize Next.js + TypeScript + Tailwind + shadcn/ui
- Set up Supabase project (database, storage, auth)
- Write all database migrations
- Configure storage buckets + RLS policies
- Build Supabase client utilities
- Implement order state machine
- Hebrew PDF proof-of-concept
- Build admin auth (login, middleware, profiles)

### Phase 2: Customer Flow (Weeks 3-5)
- Questionnaire wizard (all 8 steps, Zod validation, auto-save)
- AI follow-up enrichment step (Claude generates follow-up questions)
- Flexible photo upload gallery (multi-upload, reorder, optional tagging)
- Order status page with Supabase Realtime
- Secure preview link system (access tokens)
- Basic email notifications (Resend)

### Phase 3: AI Pipeline (Weeks 5-8)
- Story generation service (Claude) + Hebrew rhyming prompt engineering
- Illustration service (Gemini/Nano Banana) + identity preservation tuning
- Processing jobs with inline execution + retry logic
- Version tracking for text and illustrations
- Generation settings management
- Album preview component

### Phase 4: Admin & Delivery (Weeks 8-10)
- Admin dashboard (order list, filters)
- Order detail (page-by-page review + version history)
- Regeneration triggers (per-page and bulk, with version creation)
- Generation settings editor
- Approval workflow
- PDF generation service
- Delivery email with download link
- Manual payment tracking

### Phase 5: Polish & Launch (Weeks 10-12)
- End-to-end testing with real orders
- Landing page refinement
- Mobile responsiveness
- Error handling and edge cases
- Prompt refinement based on output quality
- Production deployment

---

## 14. What Should NOT Be Built in MVP

- Online payment gateway (manual is fine for 5-10/month)
- Customer accounts/login (token-based access)
- Full conversational AI interview (beyond single follow-up step)
- Customer self-editing of album content
- Multiple illustration styles
- Multi-image pages
- Print vendor API integration
- Video/narrated album
- Locale-prefixed URL routing (`/he/`, `/en/`)
- Analytics dashboard
- Coupon/discount system
- Full test suite (test critical paths only: state machine, PDF)
- CI/CD beyond Vercel git deploys
- Webhook-based or queue-based job orchestration (inline execution sufficient for MVP)

---

## 15. Future-Ready for Album-to-Video Export

### Data model decisions made NOW (zero cost):
- `pages.narration_audio_path` (nullable)
- `pages.narration_duration_ms` (nullable)
- `pages.transition_type` (default 'fade')
- `pages.display_duration_ms` (default 5000)
- `orders.video_storage_path` (nullable)
- `orders.video_status` (nullable)

### Architecture decisions:
- Store illustrations at high resolution (2048x2048 minimum) — video needs 1080p frames
- Store text content separately from rendered layout — narration service needs raw text
- `NarrationProvider` interface slot already defined in service pattern
- Video generation will likely need a dedicated service (Remotion, FFmpeg, or video API) — data model already captures everything needed

---

## 16. Hebrew-First, Future Multilingual

### RTL in Tailwind
- Root layout: `<html lang="he" dir="rtl">`
- Use CSS logical properties everywhere: `ps-4` not `pl-4`, `me-2` not `mr-2`, `text-start` not `text-left`
- Tailwind respects `dir="rtl"` natively

### Fonts
- **Content/album:** Frank Ruhl Libre (serif, elegant, storybook feel)
- **UI:** Heebo (sans-serif, clean for forms)
- Load via `next/font/google` with `subsets: ['hebrew', 'latin']`

### i18n: Lightweight MVP Approach
- **Do NOT build locale-prefixed routing** (`/he/order/...`) in MVP — unnecessary complexity for a Hebrew-only product
- Use `next-intl` with a single locale and message files for all UI strings
- All UI strings go through `useTranslations()` so the extraction is done — but routing stays flat
- Zod validation error messages are in Hebrew string literals (not translated via i18n — they're domain-specific)
- When English support is needed later: add `/en` routing prefix, add `en.json` message file, and configure next-intl locale detection. The message keys are already in place

### PDF
- Frank Ruhl Libre TTF registered via `Font.register()`
- `direction: 'rtl'` on all text styles
- Unicode bidi markers for mixed content (Hebrew + numbers + English names)

---

## 17. Repository Documentation Structure

### `README.md`
Project name, one-line description, tech stack, prerequisites, setup instructions, available scripts, deployment.

### `CLAUDE.md`
The most important file for Claude Code productivity:
- What the project is (one paragraph)
- Tech stack list
- Architecture decisions
- Key patterns (state machine, validation, Supabase clients, versioning, prompt tracking)
- Database info
- RTL/Hebrew conventions
- File organization summary
- Common tasks reference

### `docs/`
- `architecture.md` — Full architecture (this document)
- `state-machine.md` — Order state diagram and transitions
- `api.md` — API route docs with request/response examples

### `.env.example`
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 18. Final Recommendation

### Best Pragmatic Path
1. **Week 1-2:** Project setup, DB schema, and Hebrew PDF proof-of-concept. ✅ DONE
2. **Weeks 3-5:** Customer flow end-to-end (questionnaire, follow-up enrichment, photo gallery, status page). Something testable with real users before AI integration.
3. **Weeks 5-8:** AI pipeline. Story generation first (faster feedback loop), then illustrations. Budget significant time for Hebrew rhyming prompt engineering. Track everything in `generation_settings`.
4. **Weeks 8-12:** Admin dashboard with version history, approval, PDF export, polish, launch.

### Key Decisions Summary

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Architecture | Monolith (Next.js) | Solo dev, low volume |
| Customer auth | None (secure token links) | Lower friction, privacy-safe |
| Background jobs (MVP) | Inline execution + jobs table for tracking | Simplest reliable approach; upgrade later |
| Real-time | Supabase Realtime | Built-in, zero infrastructure |
| Image stylization | Gemini API (Nano Banana Pro) | Best identity preservation |
| Story generation | Claude API | Best instruction-following for Hebrew poetry |
| Follow-up questions | Claude API (single enrichment step) | Improves story quality with minimal UX complexity |
| PDF library | @react-pdf/renderer | React-based, server-side, custom fonts |
| i18n | next-intl (messages only, no locale routing) | Strings extracted for future, no routing overhead |
| Payment | Manual (MVP) | 5-10 orders/month doesn't justify gateway |
| Versioning | `page_versions` table + versioned storage paths | Admin can compare, restore, and improve iteratively |
| Prompt tracking | `generation_settings` table | Full reproducibility and iterability |
| Preview privacy | Expiring access tokens | Protects personal family content |

### The One Thing That Could Derail the Project
**Hebrew rhyming poetry quality.** The entire product depends on the story being genuinely moving Hebrew verse. Budget time for prompt engineering and consider having a Hebrew poet review the first outputs. The technology works; the prompt is the product.

### Critical Files for Implementation
- `src/lib/state-machine.ts` — Core order state machine; every flow depends on this
- `src/services/story/claude-provider.ts` — Hebrew rhyming story generation; the prompt IS the product
- `src/services/illustration/gemini-provider.ts` — Image-to-image watercolor; identity preservation logic
- `src/services/followup/claude-provider.ts` — AI follow-up question generation
- `src/services/pdf/album-document.tsx` — React PDF component for Hebrew RTL
- `src/lib/access-token.ts` — Secure preview link generation/validation
- `supabase/migrations/` — All schema definitions

---

## 19. Privacy & Access for Customer Preview Links

### Problem
Album content includes personal family photos and intimate life stories. Bare UUID links (`/order/[uuid]/preview`) provide security-through-obscurity but no real access control.

### MVP Approach: Expiring Access Tokens
1. When an order reaches `preview_ready`, generate a random access token (32-byte hex string) stored in `orders.access_token`
2. Set `access_token_expires_at` to 30 days from creation
3. Preview link format: `/order/[orderId]/preview?token=[accessToken]`
4. Server validates: token matches, not expired. Returns 403 otherwise
5. All Supabase Storage URLs for photos/illustrations use short-lived signed URLs (1 hour expiry), generated server-side only after token validation
6. Admin can regenerate the access token (invalidating old links) if needed
7. Delivered/completed orders can have their tokens expired manually

### Future Enhancement
- Rate-limit preview access (e.g., max 50 views per token)
- IP-based access logging
- Customer can request link deactivation

---

## 20. Prompt & Settings Tracking

### Why This Matters
Story and illustration quality depend entirely on prompts and model settings. To improve quality over time, every generation must be reproducible, and settings changes must be trackable.

### How It Works
1. **`generation_settings` table** stores named configurations: system prompts, model IDs, temperature, and provider-specific params
2. Before any AI call, the service looks up the active settings for that order's `setting_type` (story/illustration/followup)
3. The `processing_jobs.generation_settings_id` links every job to its exact settings
4. `processing_jobs.input_data` stores the complete input sent to the provider (questionnaire data, image URL, etc.)
5. `processing_jobs.output_data` stores provider response metadata (tokens used, latency, any quality scores)

### Admin Workflow
- Admin can view which settings produced each output
- Admin can update settings (creates new row, deactivates old) and regenerate
- Settings changes are tracked in `admin_actions` with `action_type = 'update_settings'`
- Over time, the admin (or developer) can compare outputs across settings versions to systematically improve quality

---

## 21. Illustration-to-Page Mapping

### Purpose
After illustrations are generated for uploaded photos, the admin manually assigns each illustration to a specific album page. This is intentional — automated mapping cannot reliably match a photo to the right page in the story without human judgment.

### Data Model
- `photos.illustration_storage_path` — path in the `illustrations` Supabase bucket
- `photos.illustration_status` — `'completed'` when the Gemini watercolor pass has finished
- `pages.photo_id` — FK to the assigned `photos` row (nullable)
- `pages.illustration_storage_path` — denormalized copy of the assigned illustration path; read by the preview loader

### Assignment Flow
1. Admin generates illustrations in `AdminPhotosGallery` (triggers Gemini API for selected photos)
2. Admin opens the album preview page: `/admin/orders/[orderId]/preview`
3. `IllustrationPageMapper` component shows all `illustration_and_text` pages on the left and completed illustration thumbnails on the right
4. Admin clicks a page, then clicks a photo thumbnail → calls `PUT /api/admin/orders/[orderId]/pages/[pageId]/assign-illustration` with `{ photoId }`
5. API route verifies `photos.illustration_status === 'completed'`, then sets `pages.photo_id` and `pages.illustration_storage_path`
6. `router.refresh()` triggers Server Component re-render — preview updates immediately

### Clearing an Assignment
Pass `{ photoId: null }` to the same route. Both `pages.photo_id` and `pages.illustration_storage_path` are set to null.

### Preview Rendering
`loadPreviewData()` (`src/lib/preview/loader.ts`) reads `pages.illustration_storage_path` and generates a 1-hour Supabase signed URL. Content pages show the illustration filling the full square page, with text overlaid using a bottom gradient.

---

## 22. Album Preview Architecture

### Design Goal
The browser preview must feel like an open 25×25 cm square photo book — not a web list of cards.

### Page Layout
Every page type (cover, dedication, content, text-only, back cover) uses `aspect-square w-full` so pages are perfectly square, regardless of viewport width.

### Two-Page Spread
`AlbumPreview` groups pages into pairs. In RTL context, the first page of each pair sits on the right (as in Hebrew books). A subtle center spine shadow (3 px gradient strip) simulates the book binding.

### Content Page Rendering (`illustration_and_text`)
- Illustration: `position: absolute; inset: 0; object-fit: cover` — fills the entire page
- No illustration: soft gradient placeholder with ✦ symbol
- Text: `position: absolute; bottom: 0` with `bg-gradient-to-t from-black/72` — ensures readability without opaque boxes
- Font: `YardenAlbum` serif at 15px with `text-shadow` for contrast

### Navigation
Prev/next buttons + dot indicators (one dot per spread). Animation: `albumSpreadIn` fade + 4px slide on spread change.

---

## Verification Plan

After implementation, test end-to-end:
1. Create an order via landing page CTA
2. Complete all 8 questionnaire steps, verify auto-save works
3. Complete AI follow-up enrichment step (or skip it)
4. Upload 10+ photos with reordering and optional tagging
5. Trigger text generation, verify Hebrew rhyming output quality
6. Trigger illustration generation, verify watercolor style + identity preservation
7. View album preview via secure token link, verify RTL layout, pagination
8. Admin: review order, edit text, regenerate an illustration, compare versions
9. Admin: approve order, trigger PDF export
10. Verify PDF: Hebrew RTL text, illustration quality, print-ready resolution
11. Verify email notifications at each stage
12. Verify expired/invalid tokens are rejected
