-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('contributor', 'requester', 'both');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE dataset_status AS ENUM ('active', 'closing-soon', 'completed', 'paused');
CREATE TYPE dataset_category AS ENUM ('computer-vision', 'natural-language', 'speech-audio', 'healthcare', 'robotics', 'other');
CREATE TYPE data_type AS ENUM ('image', 'video', 'audio', 'text', 'mixed');

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    role user_role DEFAULT 'both',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dataset requests table
CREATE TABLE dataset_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category dataset_category NOT NULL,
    data_type data_type NOT NULL,
    status dataset_status DEFAULT 'active',
    samples_needed INTEGER NOT NULL CHECK (samples_needed > 0),
    samples_collected INTEGER DEFAULT 0 CHECK (samples_collected >= 0),
    reward_amount DECIMAL(10, 2) NOT NULL CHECK (reward_amount >= 0),
    currency TEXT DEFAULT 'USD',
    deadline DATE NOT NULL,
    quality_criteria TEXT[] DEFAULT '{}',
    requirements TEXT[] DEFAULT '{}',
    featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions table
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_request_id UUID NOT NULL REFERENCES dataset_requests(id) ON DELETE CASCADE,
    contributor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_urls TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    status submission_status DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dataset_request_id, contributor_id, created_at)
);

-- Create indexes for better performance
CREATE INDEX idx_dataset_requests_created_by ON dataset_requests(created_by);
CREATE INDEX idx_dataset_requests_status ON dataset_requests(status);
CREATE INDEX idx_dataset_requests_category ON dataset_requests(category);
CREATE INDEX idx_dataset_requests_deadline ON dataset_requests(deadline);
CREATE INDEX idx_dataset_requests_created_at ON dataset_requests(created_at);
CREATE INDEX idx_submissions_dataset_request_id ON submissions(dataset_request_id);
CREATE INDEX idx_submissions_contributor_id ON submissions(contributor_id);
CREATE INDEX idx_submissions_status ON submissions(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dataset_requests_updated_at BEFORE UPDATE ON dataset_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update samples_collected when submission is approved
CREATE OR REPLACE FUNCTION update_samples_collected()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
        UPDATE dataset_requests
        SET samples_collected = samples_collected + 1
        WHERE id = NEW.dataset_request_id;
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
        UPDATE dataset_requests
        SET samples_collected = GREATEST(0, samples_collected - 1)
        WHERE id = NEW.dataset_request_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update samples_collected
CREATE TRIGGER on_submission_status_change
    AFTER INSERT OR UPDATE OF status ON submissions
    FOR EACH ROW EXECUTE FUNCTION update_samples_collected();

-- Function to automatically update dataset status based on deadline and samples
CREATE OR REPLACE FUNCTION update_dataset_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark as completed if samples goal reached
    IF NEW.samples_collected >= NEW.samples_needed THEN
        NEW.status = 'completed';
    -- Mark as closing-soon if within 7 days of deadline
    ELSIF NEW.deadline <= CURRENT_DATE + INTERVAL '7 days' AND NEW.status = 'active' THEN
        NEW.status = 'closing-soon';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for dataset status updates
CREATE TRIGGER auto_update_dataset_status
    BEFORE INSERT OR UPDATE OF samples_collected, deadline ON dataset_requests
    FOR EACH ROW EXECUTE FUNCTION update_dataset_status();

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Dataset requests policies
CREATE POLICY "Dataset requests are viewable by everyone"
    ON dataset_requests FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create dataset requests"
    ON dataset_requests FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own dataset requests"
    ON dataset_requests FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own dataset requests"
    ON dataset_requests FOR DELETE
    USING (auth.uid() = created_by);

-- Submissions policies
CREATE POLICY "Users can view own submissions"
    ON submissions FOR SELECT
    USING (auth.uid() = contributor_id OR auth.uid() IN (
        SELECT created_by FROM dataset_requests WHERE id = dataset_request_id
    ));

CREATE POLICY "Contributors can create submissions"
    ON submissions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "Contributors can update own submissions"
    ON submissions FOR UPDATE
    USING (auth.uid() = contributor_id);

CREATE POLICY "Dataset owners can update submission status"
    ON submissions FOR UPDATE
    USING (auth.uid() IN (
        SELECT created_by FROM dataset_requests WHERE id = dataset_request_id
    ));

-- Helper function to get dataset request with contributor count
CREATE OR REPLACE FUNCTION get_dataset_with_stats(dataset_id UUID)
RETURNS TABLE (
    id UUID,
    created_by UUID,
    title TEXT,
    description TEXT,
    category dataset_category,
    data_type data_type,
    status dataset_status,
    samples_needed INTEGER,
    samples_collected INTEGER,
    reward_amount DECIMAL,
    currency TEXT,
    deadline DATE,
    quality_criteria TEXT[],
    requirements TEXT[],
    featured BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    active_contributors BIGINT,
    creator_name TEXT,
    creator_avatar TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dr.*,
        COUNT(DISTINCT s.contributor_id) as active_contributors,
        p.full_name as creator_name,
        p.avatar_url as creator_avatar
    FROM dataset_requests dr
    LEFT JOIN submissions s ON dr.id = s.dataset_request_id
    LEFT JOIN profiles p ON dr.created_by = p.id
    WHERE dr.id = dataset_id
    GROUP BY dr.id, p.full_name, p.avatar_url;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get user dashboard stats
CREATE OR REPLACE FUNCTION get_user_dashboard_stats(user_id UUID)
RETURNS TABLE (
    active_requests BIGINT,
    total_contributors BIGINT,
    approved_submissions BIGINT,
    total_spent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT dr.id) FILTER (WHERE dr.status = 'active'),
        COUNT(DISTINCT s.contributor_id),
        COUNT(s.id) FILTER (WHERE s.status = 'approved'),
        COALESCE(SUM(dr.reward_amount * dr.samples_collected), 0)
    FROM dataset_requests dr
    LEFT JOIN submissions s ON dr.id = s.dataset_request_id
    WHERE dr.created_by = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

