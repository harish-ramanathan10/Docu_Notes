-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Notebooks Table
CREATE TABLE IF NOT EXISTS public.notebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Chapters Table
CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Entries Table
CREATE TABLE IF NOT EXISTS public.entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL DEFAULT 'Other' CHECK (entry_type IN ('Practice', 'Course Notes', 'Other')),
    title TEXT NOT NULL,
    description TEXT,
    skills_and_concepts TEXT,
    concepts_discussed TEXT,
    question_log TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    raw_text TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON public.notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_notebook_id ON public.chapters(notebook_id);
CREATE INDEX IF NOT EXISTS idx_entries_notebook_id ON public.entries(notebook_id);
CREATE INDEX IF NOT EXISTS idx_entries_chapter_id ON public.entries(chapter_id);
CREATE INDEX IF NOT EXISTS idx_documents_entry_id ON public.documents(entry_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Row Level Security (RLS) Policies

-- Notebooks policies
CREATE POLICY "Users can manage their own notebooks" 
ON public.notebooks
FOR ALL 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Chapters policies (Check user owns parent notebook)
CREATE POLICY "Users can manage chapters of their own notebooks"
ON public.chapters
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.notebooks 
        WHERE public.notebooks.id = public.chapters.notebook_id 
        AND public.notebooks.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.notebooks 
        WHERE public.notebooks.id = public.chapters.notebook_id 
        AND public.notebooks.user_id = auth.uid()
    )
);

-- Entries policies (Check user owns parent notebook)
CREATE POLICY "Users can manage entries of their own notebooks"
ON public.entries
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.notebooks 
        WHERE public.notebooks.id = public.entries.notebook_id 
        AND public.notebooks.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.notebooks 
        WHERE public.notebooks.id = public.entries.notebook_id 
        AND public.notebooks.user_id = auth.uid()
    )
);

-- Documents policies (Check user owns parent notebook of parent entry)
CREATE POLICY "Users can manage documents of their own entries"
ON public.documents
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.entries
        JOIN public.notebooks ON public.notebooks.id = public.entries.notebook_id
        WHERE public.entries.id = public.documents.entry_id
        AND public.notebooks.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.entries
        JOIN public.notebooks ON public.notebooks.id = public.entries.notebook_id
        WHERE public.entries.id = public.documents.entry_id
        AND public.notebooks.user_id = auth.uid()
    )
);

-- 5. Storage configuration for page-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('page-images', 'page-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage object policies
CREATE POLICY "Users can upload pages to their folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'page-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read pages from their folder"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'page-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete pages from their folder"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'page-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

