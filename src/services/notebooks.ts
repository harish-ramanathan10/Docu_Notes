import { createClient } from '@/utils/supabase/server';

export async function createNotebook(name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const { data, error } = await supabase
    .from('notebooks')
    .insert({ name, user_id: user.id, status: 'active' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listActiveNotebooks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notebooks')
    .select('*, chapters(count), entries(count)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function listArchivedNotebooks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notebooks')
    .select('*, chapters(count), entries(count)')
    .eq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function archiveNotebook(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notebooks')
    .update({ status: 'archived' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unarchiveNotebook(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notebooks')
    .update({ status: 'active' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNotebook(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('notebooks')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}
