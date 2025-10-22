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
  IF NOT EXISTS (
    SELECT 1
    FROM storage.policies
    WHERE name = 'Dataset images are publicly readable'
      AND bucket_id = 'dataset-images'
      AND action = 'read'
  ) THEN
    PERFORM storage.create_policy(
      'dataset-images',
      'Dataset images are publicly readable',
      'true',
      'read',
      ARRAY['anon', 'authenticated']
    );
  END IF;
END $$;

-- Authenticated users can upload (insert) dataset images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.policies
    WHERE name = 'Authenticated users can upload dataset images'
      AND bucket_id = 'dataset-images'
      AND action = 'insert'
  ) THEN
    PERFORM storage.create_policy(
      'dataset-images',
      'Authenticated users can upload dataset images',
      'auth.role() = ''authenticated''',
      'insert',
      ARRAY['authenticated']
    );
  END IF;
END $$;

-- Only owners can update their dataset images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.policies
    WHERE name = 'Owners can update dataset images'
      AND bucket_id = 'dataset-images'
      AND action = 'update'
  ) THEN
    PERFORM storage.create_policy(
      'dataset-images',
      'Owners can update dataset images',
      'auth.uid() = owner',
      'update',
      ARRAY['authenticated']
    );
  END IF;
END $$;

-- Only owners can delete their dataset images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.policies
    WHERE name = 'Owners can delete dataset images'
      AND bucket_id = 'dataset-images'
      AND action = 'delete'
  ) THEN
    PERFORM storage.create_policy(
      'dataset-images',
      'Owners can delete dataset images',
      'auth.uid() = owner',
      'delete',
      ARRAY['authenticated']
    );
  END IF;
END $$;
