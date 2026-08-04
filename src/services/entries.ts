import { createClient } from '@/utils/supabase/server';

export interface CreateEntryInput {
  notebookId: string;
  chapterId: string | null;
  entryType: 'Practice' | 'Course Notes' | 'Other';
  title: string;
  description?: string;
  skillsAndConcepts?: string;
  conceptsDiscussed?: string;
  questionLog?: string;
  documents: {
    imageUrl: string;
    rawText?: string;
    position: number;
  }[];
}

export async function createEntry(input: CreateEntryInput) {
  const supabase = await createClient();

  // Create entry
  const { data: entry, error: entryError } = await supabase
    .from('entries')
    .insert({
      notebook_id: input.notebookId,
      chapter_id: input.chapterId,
      entry_type: input.entryType,
      title: input.title,
      description: input.description || '',
      skills_and_concepts: input.skillsAndConcepts || '',
      concepts_discussed: input.conceptsDiscussed || '',
      question_log: input.questionLog || '',
    })
    .select()
    .single();

  if (entryError) throw entryError;

  // Create documents
  if (input.documents && input.documents.length > 0) {
    const documentsToInsert = input.documents.map((doc) => ({
      entry_id: entry.id,
      image_url: doc.imageUrl,
      raw_text: doc.rawText || '',
      position: doc.position,
    }));

    const { error: docsError } = await supabase
      .from('documents')
      .insert(documentsToInsert);

    if (docsError) {
      // Clean up the entry if documents insertion fails
      await supabase.from('entries').delete().eq('id', entry.id);
      throw docsError;
    }
  }

  return entry;
}

export async function listEntriesInChapter(chapterId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('entries')
    .select('*, documents(*)')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function addDocumentToEntry(entryId: string, document: { imageUrl: string; rawText?: string; position: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .insert({
      entry_id: entryId,
      image_url: document.imageUrl,
      raw_text: document.rawText || '',
      position: document.position,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeDocumentFromEntry(documentId: string, entryId: string) {
  const supabase = await createClient();

  // Delete the document
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (deleteError) throw deleteError;

  // Check how many documents remain in the entry
  const { count, error: countError } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('entry_id', entryId);

  if (countError) throw countError;

  // Auto-delete the entry if its last document is removed
  if (count === 0) {
    const { error: entryDeleteError } = await supabase
      .from('entries')
      .delete()
      .eq('id', entryId);
    if (entryDeleteError) throw entryDeleteError;
    return { deletedEntry: true };
  }

  return { deletedEntry: false };
}

export async function updateEntry(
  id: string,
  updates: Partial<Omit<CreateEntryInput, 'documents'>>
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('entries')
    .update({
      notebook_id: updates.notebookId,
      chapter_id: updates.chapterId,
      entry_type: updates.entryType,
      title: updates.title,
      description: updates.description,
      skills_and_concepts: updates.skillsAndConcepts,
      concepts_discussed: updates.conceptsDiscussed,
      question_log: updates.questionLog,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
