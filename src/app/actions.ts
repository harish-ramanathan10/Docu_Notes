'use server';

import { createClient } from '@/utils/supabase/server';
import * as notebookService from '@/services/notebooks';
import * as chapterService from '@/services/chapters';
import * as entryService from '@/services/entries';
import { analyzeNoteImages } from '@/utils/ai';

// --- Notebook Actions ---
export async function createNotebook(name: string) {
  return await notebookService.createNotebook(name);
}

export async function getNotebooksAndChapters() {
  const notebooks = await notebookService.listActiveNotebooks();
  return notebooks || [];
}

export async function archiveNotebook(id: string) {
  return await notebookService.archiveNotebook(id);
}

export async function unarchiveNotebook(id: string) {
  return await notebookService.unarchiveNotebook(id);
}

export async function deleteNotebook(id: string) {
  return await notebookService.deleteNotebook(id);
}

// --- Chapter Actions ---
export async function createChapter(notebookId: string, name: string, position: number = 0) {
  return await chapterService.createChapter(notebookId, name, position);
}

export async function deleteChapter(id: string) {
  return await chapterService.deleteChapter(id);
}

export async function renameChapter(id: string, name: string) {
  return await chapterService.renameChapter(id, name);
}

export async function reorderChapters(chapters: { id: string; position: number }[]) {
  return await chapterService.reorderChapters(chapters);
}

// --- Entry & Document Actions ---
export async function updateEntry(id: string, updates: any) {
  return await entryService.updateEntry(id, updates);
}

export async function deleteDocument(documentId: string, entryId: string) {
  const status = await entryService.removeDocumentFromEntry(documentId, entryId);
  
  if (status.deletedEntry) {
    return { deletedEntry: true };
  }

  // If entry is not deleted, trigger re-analysis
  const reanalysis = await reanalyzeEntry(entryId);
  return { deletedEntry: false, updatedEntry: reanalysis.entry };
}

export async function addDocumentAndReanalyze(entryId: string, imageUrl: string, position: number) {
  await entryService.addDocumentToEntry(entryId, { imageUrl, position });
  const reanalysis = await reanalyzeEntry(entryId);
  return reanalysis.entry;
}

export async function reanalyzeEntry(entryId: string) {
  const supabase = await createClient();

  // 1. Fetch remaining documents of the entry (in order)
  const { data: docs, error: fetchDocsError } = await supabase
    .from('documents')
    .select('*')
    .eq('entry_id', entryId)
    .order('position', { ascending: true });

  if (fetchDocsError) throw fetchDocsError;

  if (!docs || docs.length === 0) {
    // If no documents left, delete the entry
    await supabase.from('entries').delete().eq('id', entryId);
    return { deleted: true, entry: null };
  }

  // 2. Call the AI helper to re-analyze
  const imagePaths = docs.map((d) => d.image_url);
  const aiResult = await analyzeNoteImages(imagePaths);

  // 3. Update the entry with AI results
  const { data: updatedEntry, error: updateError } = await supabase
    .from('entries')
    .update({
      entry_type: aiResult.entry_type,
      title: aiResult.title,
      description: aiResult.description,
      skills_and_concepts: aiResult.skills_and_concepts,
      concepts_discussed: aiResult.concepts_discussed,
      question_log: aiResult.question_log,
      notebook_id: aiResult.notebook_id,
      chapter_id: aiResult.chapter_id,
    })
    .eq('id', entryId)
    .select()
    .single();

  if (updateError) throw updateError;

  // 4. Update raw text on individual documents
  for (let i = 0; i < docs.length; i++) {
    const rawText = aiResult.raw_text_per_page[i] || '';
    await supabase.from('documents').update({ raw_text: rawText }).eq('id', docs[i].id);
  }

  return { deleted: false, entry: updatedEntry };
}

// --- Scoped Notebook Search ---
export interface SearchResult {
  entryId: string;
  entryTitle: string;
  chapterId: string | null;
  matchType: 'entry' | 'document';
  matchedSnippet: string;
  leafIndex: number; // calculated page position within chapter sequence
}

export async function searchNotebook(notebookId: string, query: string): Promise<SearchResult[]> {
  if (!query || query.trim() === '') return [];

  const supabase = await createClient();

  // 1. Query matching entries
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select('id, title, description, skills_and_concepts, concepts_discussed, question_log, chapter_id')
    .eq('notebook_id', notebookId)
    .or(
      `title.ilike.%${query}%,description.ilike.%${query}%,skills_and_concepts.ilike.%${query}%,concepts_discussed.ilike.%${query}%,question_log.ilike.%${query}%`
    );

  if (entriesError) throw entriesError;

  // 2. Query matching documents (raw text matches)
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, entry_id, raw_text, position, entries!inner(id, title, chapter_id)')
    .eq('entries.notebook_id', notebookId)
    .ilike('raw_text', `%${query}%`);

  if (docsError) throw docsError;

  const results: SearchResult[] = [];
  const processedEntryIds = new Set<string>();

  // Map to speed up chapter-leaf positioning calculations
  const chapterLeafCache: Record<string, string[]> = {};

  const getLeafIndex = async (chapterId: string | null, targetId: string, isDoc: boolean) => {
    if (!chapterId) return 0;

    // Load leaf sequence for chapter if not cached
    if (!chapterLeafCache[chapterId]) {
      const { data: chapEntries, error: err } = await supabase
        .from('entries')
        .select('id, documents(id, position)')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: true });

      if (err || !chapEntries) return 0;

      const sequence: string[] = [];
      for (const entry of chapEntries) {
        // First is entry description leaf
        sequence.push(`entry-${entry.id}`);
        // Sorted docs
        const sortedDocs = [...(entry.documents || [])].sort((a, b) => a.position - b.position);
        for (const doc of sortedDocs) {
          sequence.push(`doc-${doc.id}`);
        }
      }
      chapterLeafCache[chapterId] = sequence;
    }

    const key = isDoc ? `doc-${targetId}` : `entry-${targetId}`;
    const idx = chapterLeafCache[chapterId].indexOf(key);
    return idx === -1 ? 0 : idx;
  };

  // 3. Process entry matches
  for (const entry of entries) {
    processedEntryIds.add(entry.id);

    // Pick first matching snippet
    let snippet = entry.description || '';
    if (entry.title.toLowerCase().includes(query.toLowerCase())) {
      snippet = `Title: ${entry.title}`;
    } else if (entry.skills_and_concepts?.toLowerCase().includes(query.toLowerCase())) {
      snippet = `Skills: ${entry.skills_and_concepts}`;
    }

    const leafIndex = await getLeafIndex(entry.chapter_id, entry.id, false);

    results.push({
      entryId: entry.id,
      entryTitle: entry.title,
      chapterId: entry.chapter_id,
      matchType: 'entry',
      matchedSnippet: snippet.substring(0, 100) + (snippet.length > 100 ? '...' : ''),
      leafIndex,
    });
  }

  // 4. Process document/OCR matches
  for (const doc of docs) {
    const docEntry: any = doc.entries;
    if (processedEntryIds.has(docEntry.id)) continue; // skip duplicates

    const snippet = doc.raw_text || '';
    const matchIdx = snippet.toLowerCase().indexOf(query.toLowerCase());
    const start = Math.max(0, matchIdx - 30);
    const end = Math.min(snippet.length, matchIdx + 70);
    const textSnippet = 'OCR: ...' + snippet.substring(start, end).replace(/\n/g, ' ') + '...';

    const leafIndex = await getLeafIndex(docEntry.chapter_id, doc.id, true);

    results.push({
      entryId: docEntry.id,
      entryTitle: docEntry.title,
      chapterId: docEntry.chapter_id,
      matchType: 'document',
      matchedSnippet: textSnippet,
      leafIndex,
    });
  }

  return results;
}
