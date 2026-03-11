-- Add follow-up Q&A storage to questionnaire_responses.
-- followup_questions stores the AI-generated questions and the customer's answers
-- as a JSON array: [{ "question": "...", "answer": "..." }, ...]
-- An empty array means follow-up was skipped.
alter table public.questionnaire_responses
  add column followup_questions jsonb not null default '[]';
