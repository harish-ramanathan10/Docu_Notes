'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import imageCompression from 'browser-image-compression';
import { createClient } from '@/utils/supabase/client';
import {
  updateEntry,
  deleteDocument,
  addDocumentAndReanalyze,
  getNotebooksAndChapters,
} from '../../../../actions';

interface Leaf {
  type: 'description' | 'page';
  entryId: string;
  docId?: string;
  imageUrl?: string; // Signed URL
  storagePath?: string; // DB storage path
  rawText?: string;
  position?: number;
  entry: any;
}

/* --- Inline icons, consistent with the rest of the app --- */
const ChevronLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

// AI-generated fields often fill in filler like "None applicable" or
// "No questions were worked through" when a section doesn't apply to a
// given entry (e.g. a personal photo). Treat those as empty so the
// leaf only shows sections that actually have content.
const NOT_APPLICABLE_PATTERNS = [
  /^none$/i,
  /^n\/a$/i,
  /^not applicable/i,
  /none applicable/i,
  /no questions/i,
  /not present/i,
  /does not (contain|apply|include)/i,
  /this is (a|an) (personal )?(photo|photograph|image)/i,
];

function hasMeaningfulText(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !NOT_APPLICABLE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export default function ChapterFlipBookPage() {
  const router = useRouter();
  const { id: notebookId, chapterId } = useParams() as { id: string; chapterId: string };
  const searchParams = useSearchParams();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flip-book leaves state
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [leftIndex, setLeftIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Zoom modal state
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  // Editing state for the active description leaf
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState<'Practice' | 'Course Notes' | 'Other'>('Other');
  const [editNotebookId, setEditNotebookId] = useState('');
  const [editChapterId, setEditChapterId] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editConcepts, setEditConcepts] = useState('');
  const [editQuestionLog, setEditQuestionLog] = useState('');

  // Staged variables for dropdown selector context
  const [allNotebooks, setAllNotebooks] = useState<any[]>([]);

  // Page upload loading states
  const [uploadingPageForEntry, setUploadingPageForEntry] = useState<string | null>(null);

  // Search bar state (positioned/styled to match the notebook detail page)
  const [searchQuery, setSearchQuery] = useState('');

  async function loadChapterBook() {
    setLoading(true);
    try {
      // 1. Fetch entries and their documents
      const { data: entries, error: err } = await supabase
        .from('entries')
        .select('*, documents(*)')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: true });

      if (err) throw err;

      // 2. Fetch all notebooks & chapters for edit dropdown mapping
      const books = await getNotebooksAndChapters();
      setAllNotebooks(books);

      if (!entries || entries.length === 0) {
        setLeaves([]);
        setLoading(false);
        return;
      }

      // 3. For each document, generate a signed URL since the bucket is private
      const leafSeq: Leaf[] = [];

      for (const entry of entries) {
        // Add entry description leaf
        leafSeq.push({
          type: 'description',
          entryId: entry.id,
          entry,
        });

        const sortedDocs = (entry.documents || []).sort((a: any, b: any) => a.position - b.position);
        for (const doc of sortedDocs) {
          // Generate signed URL
          const { data: signedData } = await supabase.storage
            .from('page-images')
            .createSignedUrl(doc.image_url, 3600); // 1 hour token

          leafSeq.push({
            type: 'page',
            entryId: entry.id,
            docId: doc.id,
            storagePath: doc.image_url,
            imageUrl: signedData?.signedUrl || '',
            rawText: doc.raw_text || '',
            position: doc.position,
            entry,
          });
        }
      }

      setLeaves(leafSeq);

      // Check search parameter leaf query redirect
      const queryLeaf = searchParams.get('leaf');
      if (queryLeaf) {
        const parsed = parseInt(queryLeaf);
        if (!isNaN(parsed) && parsed >= 0 && parsed < leafSeq.length) {
          setLeftIndex(parsed);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (window.innerWidth < 768) {
      router.push('/capture');
      return;
    }
    if (chapterId) loadChapterBook();

    const handleResize = () => {
      if (window.innerWidth < 768) {
        router.push('/capture');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chapterId, searchParams]);

  // Flip Actions
  const handleFlipForward = () => {
    if (leftIndex < leaves.length) {
      setLeftIndex((prev) => prev + 1);
    }
  };

  const handleFlipBackward = () => {
    if (leftIndex > 0) {
      setLeftIndex((prev) => prev - 1);
    }
  };

  // Edit Entry Mode
  const startEditing = (leaf: Leaf) => {
    const entry = leaf.entry;
    setEditingEntryId(entry.id);
    setEditTitle(entry.title || '');
    setEditDesc(entry.description || '');
    setEditType(entry.entry_type || 'Other');
    setEditNotebookId(entry.notebook_id || '');
    setEditChapterId(entry.chapter_id || '');
    setEditSkills(entry.skills_and_concepts || '');
    setEditConcepts(entry.concepts_discussed || '');
    setEditQuestionLog(entry.question_log || '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntryId) return;
    try {
      await updateEntry(editingEntryId, {
        notebookId: editNotebookId,
        chapterId: editChapterId || null,
        entryType: editType,
        title: editTitle,
        description: editDesc,
        skillsAndConcepts: editSkills,
        conceptsDiscussed: editConcepts,
        questionLog: editQuestionLog,
      });

      setEditingEntryId(null);
      // Reload chapter book
      await loadChapterBook();
    } catch (err) {
      console.error(err);
    }
  };

  // Document Management: Delete Page
  const handleDeletePage = async (docId: string, entryId: string) => {
    if (!window.confirm('Delete this page? Doing so will trigger AI re-analysis on the remaining pages.')) return;
    try {
      const status = await deleteDocument(docId, entryId);
      if (status.deletedEntry) {
        // If entry was auto-deleted, go back or adjust leftIndex
        setLeftIndex(0);
      }
      await loadChapterBook();
    } catch (err) {
      console.error(err);
    }
  };

  // Document Management: Append Page
  const handleAddPage = async (e: React.ChangeEvent<HTMLInputElement>, entry: any) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    setUploadingPageForEntry(entry.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthorized');

      // 1. Compress Image
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1800,
        useWebWorker: true,
        fileType: 'image/jpeg',
      };
      const compressedFile = await imageCompression(file, options);

      // 2. Upload to storage
      const fileName = `${user.id}/${Date.now()}_added_page.jpg`;
      const { data: storageData, error: uploadErr } = await supabase.storage
        .from('page-images')
        .upload(fileName, compressedFile, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // 3. Insert doc & trigger Gemini re-analysis
      const nextPosition = (entry.documents?.length || 0) + 1;
      await addDocumentAndReanalyze(entry.id, storageData.path, nextPosition);

      // Reload
      await loadChapterBook();
    } catch (err) {
      console.error('Failed to add page:', err);
    } finally {
      setUploadingPageForEntry(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] text-[#1C1C1C] flex items-center justify-center font-[Inter,sans-serif]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1C1C1C]" />
      </div>
    );
  }

  // Double leaves display
  const leftLeaf = leaves[leftIndex];
  const rightLeaf = leaves[leftIndex + 1];

  const matchedEditNotebook = allNotebooks.find((n) => n.id === editNotebookId);
  const editChaptersList = matchedEditNotebook?.chapters || [];

  // Shared entry-edit form (Source: same fields used for both leaves)
  const renderEditForm = () => (
    <div className="space-y-4 text-sm p-6">
      <div>
        <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Title</label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Type</label>
        <select
          value={editType}
          onChange={(e: any) => setEditType(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
        >
          <option value="Practice">Practice</option>
          <option value="Course Notes">Course Notes</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Notebook</label>
          <select
            value={editNotebookId}
            onChange={(e) => {
              setEditNotebookId(e.target.value);
              setEditChapterId('');
            }}
            className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
          >
            {allNotebooks.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Chapter</label>
          <select
            value={editChapterId}
            onChange={(e) => setEditChapterId(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
          >
            <option value="">-- Unassigned --</option>
            {editChaptersList.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Description</label>
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Skills &amp; Concepts</label>
        <textarea
          value={editSkills}
          onChange={(e) => setEditSkills(e.target.value)}
          rows={1}
          className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Question Log</label>
        <textarea
          value={editQuestionLog}
          onChange={(e) => setEditQuestionLog(e.target.value)}
          rows={1}
          className="w-full px-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => setEditingEntryId(null)}
          className="flex-1 py-2 rounded-md border border-[#1C1C1C]/10 text-[#1C1C1C] text-sm font-semibold hover:bg-[#F9F8F6] transition-all duration-200 ease-out"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveEdit}
          className="flex-1 py-2 rounded-md bg-[#1C1C1C] text-white text-sm font-semibold hover:opacity-90 transition-all duration-200 ease-out"
        >
          Save
        </button>
      </div>
    </div>
  );

  const renderDescriptionLeaf = (leaf: Leaf) => (
    <div className="h-full flex flex-col justify-between p-6">
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <span className="text-[10px] px-2 py-1 rounded-md bg-[#F9F8F6] border border-[#1C1C1C]/10 text-[#1C1C1C] font-bold uppercase tracking-wider">
            {leaf.entry.entry_type}
          </span>
          <button
            onClick={() => startEditing(leaf)}
            aria-label="Edit entry"
            className="w-10 h-10 flex items-center justify-center rounded-md bg-[#F9F8F6] border border-[#1C1C1C]/10 text-[#1C1C1C] hover:bg-white transition-all duration-200 ease-out"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#1C1C1C] leading-tight">{leaf.entry.title}</h3>
          <p className="text-[10px] uppercase tracking-wider text-[#797676] mt-1.5 font-bold">
            Captured {new Date(leaf.entry.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="space-y-4">
          {hasMeaningfulText(leaf.entry.description) && (
            <div>
              <span className="block text-[10px] text-[#797676] uppercase tracking-wider mb-1.5 font-bold">Summary</span>
              <p className="text-sm text-[#1C1C1C] leading-relaxed">{leaf.entry.description}</p>
            </div>
          )}
          {hasMeaningfulText(leaf.entry.skills_and_concepts) && (
            <div>
              <span className="block text-[10px] text-[#797676] uppercase tracking-wider mb-1.5 font-bold">Skills demonstrated</span>
              <p className="text-sm text-[#1C1C1C] leading-relaxed">{leaf.entry.skills_and_concepts}</p>
            </div>
          )}
          {hasMeaningfulText(leaf.entry.question_log) && (
            <div>
              <span className="block text-[10px] text-[#797676] uppercase tracking-wider mb-1.5 font-bold">Question Log</span>
              <p className="text-sm text-[#1C1C1C] leading-relaxed">{leaf.entry.question_log}</p>
            </div>
          )}
          {!hasMeaningfulText(leaf.entry.description) &&
            !hasMeaningfulText(leaf.entry.skills_and_concepts) &&
            !hasMeaningfulText(leaf.entry.question_log) && (
              <p className="text-sm text-[#8E8E93] italic">No notes for this entry.</p>
            )}
        </div>
      </div>

      {/* Document management tray */}
      <div className="border-t border-[#1C1C1C]/10 pt-4 mt-6 flex justify-end items-center">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPageForEntry === leaf.entryId}
          className="px-4 py-2 rounded-md bg-[#F9F8F6] border border-[#1C1C1C]/10 text-[#1C1C1C] hover:bg-white text-sm font-semibold disabled:opacity-50 transition-all duration-200 ease-out"
        >
          {uploadingPageForEntry === leaf.entryId ? 'Adding...' : '+ Add Page'}
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={(e) => handleAddPage(e, leaf.entry)}
          className="hidden"
        />
      </div>
    </div>
  );

  const renderPageLeaf = (leaf: Leaf) => (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 w-full overflow-y-auto relative group flex items-start justify-center">
        <img
          src={leaf.imageUrl}
          alt="Page leaf"
          onClick={() => setZoomImg(leaf.imageUrl || null)}
          className="w-full h-auto object-contain cursor-zoom-in"
        />
        <button
          onClick={() => handleDeletePage(leaf.docId!, leaf.entryId)}
          aria-label="Delete page"
          title="Delete Page"
          className="absolute bottom-3 right-3 w-10 h-10 flex items-center justify-center rounded-md bg-[#B3261E] text-white opacity-0 group-hover:opacity-100 hover:opacity-90 transition-all duration-200 ease-out z-10"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="text-[10px] uppercase tracking-wider flex justify-between items-center text-[#797676] font-bold bg-white/90 backdrop-blur-sm px-3 py-1.5">
        <span>Page {leaf.position}</span>
        <span>Click to zoom</span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#F9F8F6] text-[#1C1C1C] font-[Inter,sans-serif] flex flex-col">
      {/* Header bar */}
      <header className="border-b border-[#1C1C1C]/10 bg-white px-8 py-4 flex items-center gap-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 shrink-0"
        >
          <div
            className="w-7 h-7 bg-[#1C1C1C]"
            style={{
              WebkitMaskImage: 'url(/DocuNotesLogo.png)',
              maskImage: 'url(/DocuNotesLogo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
            }}
          />
          <span className="text-xl font-bold tracking-tight font-[\'Source_Serif_4\',serif]">
            DocuNotes
          </span>
        </button>

        <div className="flex-1 max-w-md">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-2 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-sm text-[#1C1C1C] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => router.push(`/notebook/${notebookId}`)}
            className="px-4 py-2.5 rounded-md bg-white border border-[#1C1C1C]/10 text-[#1C1C1C] text-sm font-semibold hover:bg-[#F9F8F6] transition-all duration-200 ease-out"
          >
            &larr; Back to Chapter List
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 w-full mx-auto px-8 py-10 flex flex-col">
        {leaves.length === 0 ? (
          <div className="max-w-6xl w-full mx-auto bg-white border border-[#1C1C1C]/10 rounded-md p-7 text-left">
            <p className="text-base text-[#797676] mb-4">No entries filed in this chapter yet.</p>
            <button
              onClick={() => router.push('/capture')}
              className="px-4 py-2.5 rounded-md bg-[#1C1C1C] text-white text-sm font-semibold hover:opacity-90 transition-all duration-200 ease-out"
            >
              Go Capture Notes
            </button>
          </div>
        ) : (
          <section className="flex-1 flex flex-col items-center justify-center w-full">
            <p className="text-[10px] uppercase tracking-wider text-[#797676] font-bold mb-3">
              Leaf {leftIndex + 1}&ndash;{Math.min(leftIndex + 2, leaves.length + 1)} of {leaves.length + 1}
            </p>

            {/* Book spread — spans the full width of the content column */}
            <div className="grid grid-cols-1 md:grid-cols-2 w-full h-[76vh] max-h-[760px] bg-white border border-[#1C1C1C]/10 rounded-md shadow-[0_1px_0_0_rgba(28,28,28,0.04)] relative">

              {/* Spine down the center */}
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#1C1C1C]/15 to-transparent z-10" />
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 -translate-x-3 w-6 bg-gradient-to-r from-transparent to-[#1C1C1C]/[0.03] z-[5]" />
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 translate-x-3 w-6 -ml-6 bg-gradient-to-l from-transparent to-[#1C1C1C]/[0.03] z-[5]" />

              {/* LEFT LEAF */}
              <div className="overflow-y-auto flex flex-col">
                {leftLeaf ? (
                  leftLeaf.type === 'description' ? (
                    editingEntryId === leftLeaf.entryId ? renderEditForm() : renderDescriptionLeaf(leftLeaf)
                  ) : (
                    renderPageLeaf(leftLeaf)
                  )
                ) : (
                  <div className="text-[#797676] text-sm text-center m-auto">Empty page</div>
                )}
              </div>

              {/* RIGHT LEAF */}
              <div className="overflow-y-auto flex flex-col border-t md:border-t-0 border-[#1C1C1C]/10">
                {rightLeaf ? (
                  rightLeaf.type === 'description' ? (
                    editingEntryId === rightLeaf.entryId ? renderEditForm() : renderDescriptionLeaf(rightLeaf)
                  ) : (
                    renderPageLeaf(rightLeaf)
                  )
                ) : (
                  // End of chapter marker leaf
                  <div className="h-full flex flex-col justify-center items-center text-center p-6 m-auto">
                    <svg className="w-10 h-10 text-[#1C1C1C]/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <h4 className="text-sm font-bold text-[#1C1C1C]">End of Chapter</h4>
                    <p className="text-[10px] uppercase tracking-wider text-[#797676] font-bold mt-1 max-w-[160px]">
                      You&apos;ve reached the last document
                    </p>
                  </div>
                )}
              </div>

            </div>

            {/* Book navigation controls */}
            <div className="flex gap-2 items-center justify-center mt-6">
              <button
                onClick={handleFlipBackward}
                disabled={leftIndex === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-white border border-[#1C1C1C]/10 text-[#1C1C1C] text-sm font-semibold hover:bg-[#F9F8F6] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 ease-out"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Previous Page
              </button>
              <button
                onClick={handleFlipForward}
                disabled={leftIndex >= leaves.length}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-[#1C1C1C] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 ease-out"
              >
                Next Page
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Fullscreen Zoom modal */}
      {zoomImg && (
        <div
          className="fixed inset-0 z-50 bg-[#1C1C1C]/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomImg(null)}
        >
          <img
            src={zoomImg}
            alt="Fullscreen zoom"
            className="max-h-full max-w-full object-contain rounded-md"
          />
        </div>
      )}
    </main>
  );
}