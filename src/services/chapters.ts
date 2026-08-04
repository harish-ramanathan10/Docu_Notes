import { createClient } from '@/utils/supabase/server';

export async function createChapter(notebookId: string, name: string, position: number = 0) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chapters')
    .insert({ notebook_id: notebookId, name, position })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listChapters(notebookId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('notebook_id', notebookId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function renameChapter(id: string, name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chapters')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteChapter(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('chapters')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function reorderChapters(chapters: { id: string; position: number }[]) {
  const supabase = await createClient();
  
  // Use a transaction/upsert or update multiple times.
  // In Supabase client, standard update per row can be run in parallel or loop.
  const promises = chapters.map(({ id, position }) =>
    supabase.from('chapters').update({ position }).eq('id', id)
  );

  const results = await Promise.all(promises);
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    throw new Error('Some chapters failed to update: ' + errors.map(e => e.error?.message).join(', '));
  }
  return true;
}
