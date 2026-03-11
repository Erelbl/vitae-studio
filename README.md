# Vitae Studio

Premium web application for creating personalized "life story in rhymes" illustrated albums. Hebrew-first.

Customers fill a questionnaire about a person's life → AI asks targeted follow-up questions → customer uploads real photos → system generates Hebrew rhyming story + watercolor illustrations → admin reviews with version history → printable PDF exported.

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

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full technical architecture document, including:
- Data model with versioning and prompt tracking
- Order state machine
- Privacy model for customer preview links
- Service abstraction design for AI providers
- Background job strategy

## License

Private — All rights reserved.
