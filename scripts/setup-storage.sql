-- Create storage buckets for file uploads

-- Dataset files bucket (for submissions)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dataset-files', 'dataset-files', true)
ON CONFLICT (id) DO NOTHING;

-- User avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for dataset-files bucket
CREATE POLICY "Authenticated users can upload dataset files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dataset-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view all dataset files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'dataset-files');

CREATE POLICY "Users can update own dataset files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'dataset-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own dataset files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'dataset-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for user-avatars bucket
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-avatars');

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

