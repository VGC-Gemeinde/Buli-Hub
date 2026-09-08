-- The bucket the stream photos live in (docs/plans/stream-photos.md). Public
-- read, because the stream overlay loads the picture in a browser without a
-- session; writes happen only server-side with the service key. Created here
-- rather than by hand per environment, so local, staging and production get
-- it from the same migration chain.
--
-- Deleting a bucket via SQL is blocked by Supabase (storage.protect_delete),
-- so there is no down path here: removing it is a Storage API call.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stream-photos',
  'stream-photos',
  true,
  2097152,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;
