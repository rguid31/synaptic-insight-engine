-- Supabase Database Schema for Research Analysis Platform
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    analyses_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analyses table - stores all paper analyses
CREATE TABLE public.analyses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    analysis_data JSONB NOT NULL, -- Full analysis results (exploits, opportunities, etc.)
    structured_data JSONB, -- Extracted paper metadata
    source_text TEXT, -- Original scraped text
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookmarks table - user's bookmarked analyses
CREATE TABLE public.bookmarks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    overall_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure unique bookmark per user per analysis
    UNIQUE(user_id, analysis_id)
);

-- Indexes for performance
CREATE INDEX idx_analyses_user_id ON public.analyses(user_id);
CREATE INDEX idx_analyses_created_at ON public.analyses(created_at DESC);
CREATE INDEX idx_analyses_url ON public.analyses(url);
CREATE INDEX idx_analyses_overall_score ON public.analyses(overall_score);

CREATE INDEX idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX idx_bookmarks_analysis_id ON public.bookmarks(analysis_id);
CREATE INDEX idx_bookmarks_created_at ON public.bookmarks(created_at DESC);

-- Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own data
CREATE POLICY "Users can view own profile" ON public.users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can view own analyses" ON public.analyses
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own bookmarks" ON public.bookmarks
    FOR ALL USING (auth.uid() = user_id);

-- Functions and Triggers

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update analyses count
CREATE OR REPLACE FUNCTION public.update_analyses_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.users
        SET analyses_count = analyses_count + 1
        WHERE id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.users
        SET analyses_count = analyses_count - 1
        WHERE id = OLD.user_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to maintain analyses count
CREATE TRIGGER on_analysis_change
    AFTER INSERT OR DELETE ON public.analyses
    FOR EACH ROW EXECUTE PROCEDURE public.update_analyses_count();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER update_analyses_updated_at
    BEFORE UPDATE ON public.analyses
    FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- Views for dashboard analytics

-- User analytics view
CREATE OR REPLACE VIEW public.user_analytics AS
SELECT
    u.id,
    u.email,
    u.name,
    u.subscription_tier,
    u.analyses_count,
    COALESCE(AVG(a.overall_score), 0) as avg_quality_score,
    COUNT(b.id) as bookmarks_count,
    MAX(a.created_at) as last_analysis_date,
    DATE_PART('day', NOW() - MAX(a.created_at)) as days_since_last_analysis,
    u.created_at as user_since
FROM public.users u
LEFT JOIN public.analyses a ON u.id = a.user_id
LEFT JOIN public.bookmarks b ON u.id = b.user_id
GROUP BY u.id, u.email, u.name, u.subscription_tier, u.analyses_count, u.created_at;

-- Monthly analysis trends
CREATE OR REPLACE VIEW public.monthly_trends AS
SELECT
    user_id,
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as analyses_count,
    AVG(overall_score) as avg_score,
    COUNT(CASE WHEN overall_score >= 80 THEN 1 END) as high_quality_count
FROM public.analyses
GROUP BY user_id, DATE_TRUNC('month', created_at)
ORDER BY user_id, month DESC;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.analyses TO authenticated;
GRANT ALL ON public.bookmarks TO authenticated;
GRANT SELECT ON public.user_analytics TO authenticated;
GRANT SELECT ON public.monthly_trends TO authenticated;

-- Insert sample subscription tiers data (optional)
COMMENT ON COLUMN public.users.subscription_tier IS 'free: 10 analyses/month, pro: unlimited + advanced features, enterprise: teams + API';