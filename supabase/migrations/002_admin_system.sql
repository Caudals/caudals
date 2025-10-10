-- Add admin role to user_role enum
DO $$ 
BEGIN
    -- Only attempt to add 'admin' if the enum type exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') AND 
       NOT EXISTS (
         SELECT 1 
         FROM pg_enum e 
         JOIN pg_type t ON e.enumtypid = t.oid 
         WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
       ) THEN
        ALTER TYPE user_role ADD VALUE 'admin';
    END IF;
END $$;

-- Add approval status enum
DO $$ 
BEGIN
    -- Only attempt to create if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
    END IF;
END $$;


-- Add approval fields to dataset_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dataset_requests' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE dataset_requests ADD COLUMN approval_status approval_status DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dataset_requests' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE dataset_requests ADD COLUMN admin_notes TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dataset_requests' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE dataset_requests ADD COLUMN approved_by UUID REFERENCES profiles(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dataset_requests' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE dataset_requests ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create admin activity log table
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'approve_request', 'reject_request', 'approve_submission', 'reject_submission'
    target_type TEXT NOT NULL, -- 'dataset_request', 'submission'
    target_id UUID NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for activity log
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_id ON admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON admin_activity_log(created_at DESC);

-- Update RLS policies for admin access

-- Admins can view all dataset requests regardless of status
DROP POLICY IF EXISTS "Admins can view all dataset requests" ON dataset_requests;
CREATE POLICY "Admins can view all dataset requests"
    ON dataset_requests FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Admins can update any dataset request
DROP POLICY IF EXISTS "Admins can update dataset requests" ON dataset_requests;
CREATE POLICY "Admins can update dataset requests"
    ON dataset_requests FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Admins can view all submissions
DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
CREATE POLICY "Admins can view all submissions"
    ON submissions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Admins can update any submission
DROP POLICY IF EXISTS "Admins can update submissions" ON submissions;
CREATE POLICY "Admins can update submissions"
    ON submissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- RLS for admin activity log
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view activity log" ON admin_activity_log;
CREATE POLICY "Admins can view activity log"
    ON admin_activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can insert activity log" ON admin_activity_log;
CREATE POLICY "Admins can insert activity log"
    ON admin_activity_log FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Function to log admin activity
CREATE OR REPLACE FUNCTION log_admin_activity(
    p_action_type TEXT,
    p_target_type TEXT,
    p_target_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO admin_activity_log (admin_id, action_type, target_type, target_id, notes)
    VALUES (auth.uid(), p_action_type, p_target_type, p_target_id, p_notes)
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update dataset visibility to only show approved ones to non-admins
DROP POLICY IF EXISTS "Dataset requests are viewable by everyone" ON dataset_requests;
DROP POLICY IF EXISTS "Approved dataset requests are viewable by everyone" ON dataset_requests;

CREATE POLICY "Approved dataset requests are viewable by everyone"
    ON dataset_requests FOR SELECT
    USING (
        approval_status = 'approved'
        OR 
        auth.uid() = created_by
        OR
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending dataset requests (for admin dashboard)
CREATE OR REPLACE FUNCTION get_pending_dataset_requests()
RETURNS TABLE (
    id UUID,
    created_by UUID,
    title TEXT,
    description TEXT,
    category dataset_category,
    data_type data_type,
    status dataset_status,
    samples_needed INTEGER,
    reward_amount DECIMAL,
    currency TEXT,
    deadline DATE,
    created_at TIMESTAMPTZ,
    creator_name TEXT,
    creator_email TEXT
) AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        dr.id,
        dr.created_by,
        dr.title,
        dr.description,
        dr.category,
        dr.data_type,
        dr.status,
        dr.samples_needed,
        dr.reward_amount,
        dr.currency,
        dr.deadline,
        dr.created_at,
        p.full_name as creator_name,
        au.email as creator_email
    FROM dataset_requests dr
    LEFT JOIN profiles p ON dr.created_by = p.id
    LEFT JOIN auth.users au ON dr.created_by = au.id
    WHERE dr.approval_status = 'pending'
    ORDER BY dr.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending submissions (for admin dashboard)
CREATE OR REPLACE FUNCTION get_pending_submissions()
RETURNS TABLE (
    id UUID,
    dataset_request_id UUID,
    contributor_id UUID,
    file_urls TEXT[],
    metadata JSONB,
    status submission_status,
    notes TEXT,
    created_at TIMESTAMPTZ,
    dataset_title TEXT,
    contributor_name TEXT,
    contributor_email TEXT
) AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        s.id,
        s.dataset_request_id,
        s.contributor_id,
        s.file_urls,
        s.metadata,
        s.status,
        s.notes,
        s.created_at,
        dr.title as dataset_title,
        p.full_name as contributor_name,
        au.email as contributor_email
    FROM submissions s
    LEFT JOIN dataset_requests dr ON s.dataset_request_id = dr.id
    LEFT JOIN profiles p ON s.contributor_id = p.id
    LEFT JOIN auth.users au ON s.contributor_id = au.id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
