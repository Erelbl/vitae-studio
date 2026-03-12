# Vitae Studio

Premium web application for creating personalized "life story in rhymes" illustrated albums. Hebrew-first.

Customers fill a questionnaire about a person's life → AI asks targeted follow-up questions → customer uploads real photos → system generates Hebrew rhyming story + watercolor illustrations → admin assigns illustrations to pages → admin reviews and approves → customer sees album preview → printable PDF exported.

## Tech Stack

- **Frontend/Backend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- **Database & Auth**: Supabase (Postgres, Storage, Auth, Realtime)
- **AI**: Claude API (story generation, follow-up questions), Gemini API (image stylization)
- **PDF**: @react-pdf/renderer
- **Email**: Resend
- **Hosting**: Vercel

## Prerequisites

- Node.js 20+
- npm
- Supabase CLI (`npm install -g supabase`)
- A Supabase project (or local Supabase via `supabase start`)

## Setup

```bash
# Clone and install
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase and API keys in .env.local

# Start local Supabase (optional, for local development)
supabase start
supabase db push

# Generate database types
npx supabase gen types typescript --local > src/lib/supabase/types.ts

# Start dev server
npm run dev
```

## Available Scripts

- `npm run dev` — Start development server (with Turbopack)
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint

## Project Structure

```
src/
├── app/          # Pages and API routes
├── components/   # React components by domain
│   ├── admin/    # Admin-only components (IllustrationPageMapper, AdminPhotosGallery, …)
│   └── album/    # Album preview components (AlbumPreview, AlbumPageView)
├── services/     # AI provider services (story, illustration, followup, pdf, email)
├── lib/          # Shared utilities (supabase, validation, state machine, access tokens)
├── hooks/        # React hooks
├── types/        # TypeScript types
├── i18n/         # Internationalization config
└── messages/     # i18n translation files (he.json, en.json)
supabase/
├── migrations/   # Database migrations
└── functions/    # Edge Functions (future)
docs/             # Architecture documentation
```

## Admin Workflow Summary

1. **Order arrives** → admin sees it in `/admin`
2. **Generate story** → Claude produces 40-page Hebrew rhyming text
3. **Generate illustrations** → select photos in `AdminPhotosGallery`, trigger Gemini watercolor stylization
4. **Edit pages** → in `/admin/orders/[id]/preview`, use the Album Page Editor:
   - Edit text per page (versioned — `page_versions` table)
   - Choose layout type (`FULL_IMAGE`, `IMAGE_TOP_TEXT_BOTTOM`, `TWO_IMAGES`, etc.)
   - Assign completed illustrations to image slots 1 + 2
   - Set zoom and crop position per slot (drag mini-preview or zoom slider)
5. **Review album** → two-page spread preview simulates 25×25 cm album
6. **Publish** → makes album visible to customer at `/order/[id]/preview?token=...`

## Album Preview

Pages are rendered as square tiles (25×25 cm equivalent) in a two-page open-book spread. Content pages (`illustration_and_text`) render according to `layout_type`:

| Layout | Description |
|--------|-------------|
| `FULL_IMAGE` | Illustration fills full page, text overlaid at bottom with gradient |
| `TEXT_ONLY` | No image, centered text |
| `IMAGE_TOP_TEXT_BOTTOM` | Image top 60%, text bottom 40% |
| `TEXT_TOP_IMAGE_BOTTOM` | Text top 40%, image bottom 60% |
| `IMAGE_LEFT_TEXT_RIGHT` | Image left 55%, text right 45% |
| `TWO_IMAGES` | Two images side by side, optional text caption |

Images are positioned using `crop_x`, `crop_y`, `scale` from the `page_images` table — enabling precise pan/zoom within each frame without distortion.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full technical architecture document, including:
- Data model with versioning and prompt tracking
- Order state machine
- Privacy model for customer preview links
- Service abstraction design for AI providers
- Background job strategy
- Illustration-to-page mapping flow

## License

Private — All rights reserved.
