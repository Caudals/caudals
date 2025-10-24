-- Create dataset-images storage bucket and policies (idempotent)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'dataset-images'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('dataset-images', 'dataset-images', TRUE);
  END IF;
END $$;

-- Public read access for dataset images
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname = 'Dataset images are publicly readable'
  ) THEN
    DROP POLICY "Dataset images are publicly readable" ON storage.objects;
  END IF;

  CREATE POLICY "Dataset images are publicly readable"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'dataset-images');
END $$;

-- Authenticated users can upload (insert) dataset images
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname = 'Authenticated users can upload dataset images'
  ) THEN
    DROP POLICY "Authenticated users can upload dataset images" ON storage.objects;
  END IF;

  CREATE POLICY "Authenticated users can upload dataset images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'dataset-images'
      AND auth.uid() = owner
    );
END $$;

-- Only owners can update their dataset images
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname = 'Owners can update dataset images'
  ) THEN
    DROP POLICY "Owners can update dataset images" ON storage.objects;
  END IF;

  CREATE POLICY "Owners can update dataset images"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'dataset-images'
      AND auth.uid() = owner
    )
    WITH CHECK (
      bucket_id = 'dataset-images'
      AND auth.uid() = owner
    );
END $$;

-- Only owners can delete their dataset images
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname = 'Owners can delete dataset images'
  ) THEN
    DROP POLICY "Owners can delete dataset images" ON storage.objects;
  END IF;

  CREATE POLICY "Owners can delete dataset images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'dataset-images'
      AND auth.uid() = owner
    );
END $$;
