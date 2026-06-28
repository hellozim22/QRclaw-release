-- Public bucket for QR profile avatars (Gateway uploads via service role; DB stores object URL only).
--
-- INSERT / RLS: Gateway uses service_role → bypasses RLS on storage.objects (no INSERT policy for anon).
-- Public SELECT policy below serves image URLs in the app. Full rationale: migration 20260330_qr_avatars_storage_policy_docs.sql.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-avatars',
  'qr-avatars',
  true,
  524288,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can read objects (bucket is public; URLs use random paths).
DROP POLICY IF EXISTS "qr_avatars_public_read" ON storage.objects;
CREATE POLICY "qr_avatars_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'qr-avatars');
