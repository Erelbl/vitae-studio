-- Add 'enrichment_complete' to the orders status enum.
-- This state sits between questionnaire_complete and photos_uploaded.
-- The customer reaches it after answering (or explicitly skipping) the AI follow-up step.

-- PostgreSQL check constraints cannot be altered in place; drop and recreate.
alter table public.orders
  drop constraint orders_status_check;

alter table public.orders
  add constraint orders_status_check check (status in (
    'created',
    'questionnaire_complete',
    'enrichment_complete',
    'photos_uploaded',
    'generating_text',
    'text_ready',
    'generating_illustrations',
    'preview_ready',
    'admin_review',
    'approved',
    'revision_requested',
    'generating_pdf',
    'delivered',
    'error_generation'
  ));
