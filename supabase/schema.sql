-- =========================================================================
-- SUPABASE SCHEMA FOR BHAGAVAD GITA COMPANION APP
-- Run this in your Supabase Project's SQL Editor (Dashboard > SQL Editor)
-- =========================================================================

-- 1. DEVOTEE PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_name TEXT,
  companion_persona TEXT DEFAULT 'sakha' CHECK (companion_persona IN ('sakha', 'guru', 'margadarshi')),
  preferred_language TEXT DEFAULT 'en',
  life_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert or update their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


-- 2. EPISODIC COMPANION MEMORIES TABLE
CREATE TABLE IF NOT EXISTS public.episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  category TEXT DEFAULT 'struggle' CHECK (category IN ('life_context', 'struggle', 'commitment', 'milestone')),
  associated_verse TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.episodic_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memories"
  ON public.episodic_memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memories"
  ON public.episodic_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memories"
  ON public.episodic_memories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memories"
  ON public.episodic_memories FOR DELETE
  USING (auth.uid() = user_id);


-- 3. SAVED VERSES ("MY GITA") TABLE
CREATE TABLE IF NOT EXISTS public.saved_verses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter INT NOT NULL,
  verse INT NOT NULL,
  reflection_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, chapter, verse)
);

-- Enable RLS
ALTER TABLE public.saved_verses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their saved verses"
  ON public.saved_verses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save verses"
  ON public.saved_verses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove saved verses"
  ON public.saved_verses FOR DELETE
  USING (auth.uid() = user_id);


-- 4. AUTO-CREATE PROFILE ON USER SIGNUP (TRIGGER)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, preferred_name, companion_persona, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'sakha',
    'en'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
