-- Add image_url column to dataset_requests (idempotent)

ALTER TABLE dataset_requests
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Ensure existing rows have a placeholder image if null
UPDATE dataset_requests
SET image_url = COALESCE(
  image_url,
  '/images/dataset-placeholder.svg'
);
