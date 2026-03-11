-- Link each processing job to the generation settings that were active when it ran.
-- Also adds 'generate_followup' to the allowed job_type values.

alter table public.processing_jobs
  add column generation_settings_id uuid references public.generation_settings(id);

alter table public.processing_jobs
  drop constraint processing_jobs_job_type_check;

alter table public.processing_jobs
  add constraint processing_jobs_job_type_check check (job_type in (
    'generate_story',
    'generate_page_text',
    'generate_illustration',
    'generate_followup',
    'generate_pdf'
  ));
