-- Storage buckets are typically created via Supabase dashboard or CLI,
-- but we define the expected structure here for reference.
--
-- Bucket: originals (private) - Customer-uploaded photos
--   Path: {order_id}/{photo_id}.{ext}
--
-- Bucket: illustrations (private) - AI-generated watercolor illustrations
--   Path: {order_id}/{page_id}.png
--
-- Bucket: exports (private) - Generated PDF files
--   Path: {order_id}/album-{timestamp}.pdf
--
-- Bucket: assets (public) - Static assets (logo, borders, textures)
--   Path: templates/{asset_name}.png

insert into storage.buckets (id, name, public) values ('originals', 'originals', false);
insert into storage.buckets (id, name, public) values ('illustrations', 'illustrations', false);
insert into storage.buckets (id, name, public) values ('exports', 'exports', false);
insert into storage.buckets (id, name, public) values ('assets', 'assets', true);
