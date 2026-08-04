'use server';

import { createClient } from '@/utils/supabase/server';
import * as notebookService from '@/services/notebooks';
import * as chapterService from '@/services/chapters';
import * as entryService from '@/services/entries';

export async function getNotebooksAndChapters() {
  const notebooks = await notebookService.listActiveNotebooks();
  return notebooks || [];
}

export async function getExistingEntries() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('entries')
    .select('id, title, created_at, notebook_id, chapter_id')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function saveNewEntry(input: {
  notebookId: string;
  chapterId: string | null;
  entryType: 'Practice' | 'Course Notes' | 'Other';
  title: string;
  description: string;
  skillsAndConcepts: string;
  conceptsDiscussed: string;
  questionLog: string;
  documents: { imageUrl: string; rawText: string; position: number }[];
}) {
  return await entryService.createEntry({
    notebookId: input.notebookId,
    chapterId: input.chapterId,
    entryType: input.entryType,
    title: input.title,
    description: input.description,
    skillsAndConcepts: input.skillsAndConcepts,
    conceptsDiscussed: input.conceptsDiscussed,
    questionLog: input.questionLog,
    documents: input.documents,
  });
}

export async function appendToExistingEntry(input: {
  entryId: string;
  documents: { imageUrl: string; rawText: string; position: number }[];
  updatedFields: {
    title: string;
    description: string;
    skillsAndConcepts: string;
    conceptsDiscussed: string;
    questionLog: string;
    notebookId: string;
    chapterId: string | null;
    entryType: 'Practice' | 'Course Notes' | 'Other';
  };
}) {
  const supabase = await createClient();

  // 1. Insert the new documents
  for (const doc of input.documents) {
    await entryService.addDocumentToEntry(input.entryId, doc);
  }

  // 2. Update entry with the new AI-refined fields
  return await entryService.updateEntry(input.entryId, input.updatedFields);
}
