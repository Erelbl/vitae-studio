-- Make photos.life_stage nullable and remove the NOT NULL default.
-- Life-stage tagging is now optional in the flexible photo gallery model.
-- The check constraint is retained to keep valid values enforced when a tag IS provided.

alter table public.photos
  alter column life_stage drop not null,
  alter column life_stage drop default;
