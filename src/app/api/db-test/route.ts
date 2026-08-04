import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as notebookService from '@/services/notebooks';
import * as chapterService from '@/services/chapters';
import * as entryService from '@/services/entries';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: 'You must be logged in to run the database tests.',
      },
      { status: 401 }
    );
  }

  const logs: string[] = [];

  try {
    // 1. Notebooks CRUD
    logs.push('Testing Notebook CRUD...');
    const notebook = await notebookService.createNotebook('Test Notebook - ' + Date.now());
    logs.push(`Notebook created: ${notebook.id}`);

    const activeNotebooks = await notebookService.listActiveNotebooks();
    logs.push(`List active notebooks count: ${activeNotebooks.length}`);

    await notebookService.archiveNotebook(notebook.id);
    logs.push(`Notebook archived`);

    const archivedNotebooks = await notebookService.listArchivedNotebooks();
    logs.push(`List archived notebooks count: ${archivedNotebooks.length}`);

    await notebookService.unarchiveNotebook(notebook.id);
    logs.push(`Notebook unarchived`);

    // 2. Chapters CRUD
    logs.push('Testing Chapter CRUD...');
    const chapter1 = await chapterService.createChapter(notebook.id, 'Chapter 1', 1);
    const chapter2 = await chapterService.createChapter(notebook.id, 'Chapter 2', 2);
    logs.push(`Chapters created: ${chapter1.id}, ${chapter2.id}`);

    await chapterService.renameChapter(chapter1.id, 'Introduction');
    logs.push(`Chapter 1 renamed to "Introduction"`);

    const chapters = await chapterService.listChapters(notebook.id);
    logs.push(`List chapters count: ${chapters.length}`);

    await chapterService.reorderChapters([
      { id: chapter1.id, position: 2 },
      { id: chapter2.id, position: 1 },
    ]);
    logs.push(`Chapters reordered`);

    // 3. Entry & Document CRUD
    logs.push('Testing Entry and Document CRUD...');
    const entry = await entryService.createEntry({
      notebookId: notebook.id,
      chapterId: chapter2.id,
      entryType: 'Practice',
      title: 'Practice set 1',
      description: 'First practice entry test',
      skillsAndConcepts: 'Addition',
      conceptsDiscussed: 'Arithmetics',
      questionLog: '1. 2+2=?',
      documents: [
        { imageUrl: 'https://example.com/page1.jpg', position: 1 },
        { imageUrl: 'https://example.com/page2.jpg', position: 2 },
      ],
    });
    logs.push(`Entry created: ${entry.id}`);

    const entries = await entryService.listEntriesInChapter(chapter2.id);
    logs.push(`List entries in chapter 2 count: ${entries.length}`);

    // Fetch the documents of the entry to get their IDs
    const { data: docs } = await supabase.from('documents').select('*').eq('entry_id', entry.id);
    if (!docs || docs.length < 2) {
      throw new Error('Failed to fetch created documents');
    }

    logs.push(`Removing document ${docs[0].id} (should keep entry alive)...`);
    const status1 = await entryService.removeDocumentFromEntry(docs[0].id, entry.id);
    logs.push(`Document removed. Entry deleted status: ${status1.deletedEntry}`);

    logs.push(`Removing document ${docs[1].id} (should auto-delete entry)...`);
    const status2 = await entryService.removeDocumentFromEntry(docs[1].id, entry.id);
    logs.push(`Last document removed. Entry deleted status: ${status2.deletedEntry}`);

    // Cleanup notebook
    await notebookService.deleteNotebook(notebook.id);
    logs.push(`Cleanup: Notebook deleted`);

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Database test failed',
        logs,
      },
      { status: 500 }
    );
  }
}
