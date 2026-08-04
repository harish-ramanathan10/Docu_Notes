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
      <div className="min-h-screen bg-[#07070d] text-white flex items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500" />
      </div>
    );
  }

  // Double leaves display
  const leftLeaf = leaves[leftIndex];
  const rightLeaf = leaves[leftIndex + 1];

  const matchedEditNotebook = allNotebooks.find((n) => n.id === editNotebookId);
  const editChaptersList = matchedEditNotebook?.chapters || [];

  return (
    <main className="relative min-h-screen bg-[#07070d] text-white font-sans overflow-hidden flex flex-col justify-between">
      {/* Background ambient glowing shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Header bar */}
      <header className="relative border-b border-white/5 bg-[#0a0a14]/65 backdrop-blur-md px-8 py-4 flex justify-between items-center z-10">
        <button
          onClick={() => router.push(`/notebook/${notebookId}`)}
          className="text-xs font-semibold text-gray-400 hover:text-white transition-all cursor-pointer"
        >
          &larr; Back to Chapter List
        </button>
        <span className="text-xs font-bold text-gray-500">
          Leaf {leftIndex + 1} - {Math.min(leftIndex + 2, leaves.length + 1)} of {leaves.length + 1}
        </span>
      </header>

      {/* Flip book space */}
      {leaves.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-sm">No entries filed in this chapter yet.</p>
            <button
              onClick={() => router.push('/capture')}
              className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-semibold text-xs text-white"
            >
              Go Capture Notes
            </button>
          </div>
        </div>
      ) : (
        <section className="flex-1 flex flex-col justify-center items-center py-6 px-4 md:px-8 max-w-6xl w-full mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-[72vh] max-h-[700px] border border-white/5 bg-[#0d0d19]/30 rounded-3xl p-4 md:p-6 shadow-2xl relative">
            
            {/* Split page center divider */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/5 z-20" />

            {/* LEFT LEAF */}
            <div className="bg-[#111122]/40 border border-white/5 rounded-2xl p-6 overflow-y-auto flex flex-col justify-between">
              {leftLeaf ? (
                leftLeaf.type === 'description' ? (
                  // Description leaf render
                  editingEntryId === leftLeaf.entryId ? (
                    // Edit mode
                    <div className="space-y-3.5 text-xs">
                      <div>
                        <label className="block text-gray-500 mb-1">Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Type</label>
                        <select
                          value={editType}
                          onChange={(e: any) => setEditType(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        >
                          <option value="Practice" className="bg-[#0e0e1a]">Practice</option>
                          <option value="Course Notes" className="bg-[#0e0e1a]">Course Notes</option>
                          <option value="Other" className="bg-[#0e0e1a]">Other</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-gray-500 mb-1">Notebook</label>
                          <select
                            value={editNotebookId}
                            onChange={(e) => {
                              setEditNotebookId(e.target.value);
                              setEditChapterId('');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                          >
                            {allNotebooks.map((n) => (
                              <option key={n.id} value={n.id} className="bg-[#0e0e1a]">{n.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-500 mb-1">Chapter</label>
                          <select
                            value={editChapterId}
                            onChange={(e) => setEditChapterId(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                          >
                            <option value="" className="bg-[#0e0e1a]">-- Unassigned --</option>
                            {editChaptersList.map((c: any) => (
                              <option key={c.id} value={c.id} className="bg-[#0e0e1a]">{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Description</label>
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Skills &amp; Concepts</label>
                        <textarea
                          value={editSkills}
                          onChange={(e) => setEditSkills(e.target.value)}
                          rows={1}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Question Log</label>
                        <textarea
                          value={editQuestionLog}
                          onChange={(e) => setEditQuestionLog(e.target.value)}
                          rows={1}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setEditingEntryId(null)}
                          className="flex-1 py-1.5 rounded-lg border border-white/10 font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 py-1.5 rounded-lg bg-indigo-500 font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Read mode description card
                    <div className="h-full flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold uppercase">
                            {leftLeaf.entry.entry_type}
                          </span>
                          <button
                            onClick={() => startEditing(leftLeaf)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                          >
                            Edit Entry
                          </button>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white leading-tight">{leftLeaf.entry.title}</h3>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Captured: {new Date(leftLeaf.entry.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed border-l-2 border-white/10 pl-3 italic">
                          {leftLeaf.entry.description}
                        </p>
                        {leftLeaf.entry.skills_and_concepts && (
                          <div>
                            <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Skills demonstrated</span>
                            <p className="text-xs text-gray-300 leading-relaxed">{leftLeaf.entry.skills_and_concepts}</p>
                          </div>
                        )}
                        {leftLeaf.entry.question_log && (
                          <div>
                            <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Question Log</span>
                            <p className="text-xs text-gray-300 leading-relaxed">{leftLeaf.entry.question_log}</p>
                          </div>
                        )}
                      </div>

                      {/* Document management tray */}
                      <div className="border-t border-white/5 pt-4 mt-6 flex justify-between items-center text-xs">
                        <span className="text-gray-500">Pages: {leftLeaf.entry.documents?.length || 0}</span>
                        
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingPageForEntry === leftLeaf.entryId}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.04] text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {uploadingPageForEntry === leftLeaf.entryId ? 'Adding...' : '+ Add Page'}
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={(e) => handleAddPage(e, leftLeaf.entry)}
                          className="hidden"
                        />
                      </div>
                    </div>
                  )
                ) : (
                  // Document Page leaf render
                  <div className="h-full flex flex-col justify-between">
                    <div className="flex-1 flex items-center justify-center relative group">
                      <img
                        src={leftLeaf.imageUrl}
                        alt={`Page leaf`}
                        onClick={() => setZoomImg(leftLeaf.imageUrl || null)}
                        className="max-h-[80%] max-w-full rounded-lg object-contain shadow-lg cursor-zoom-in transition-all group-hover:scale-[1.01]"
                      />
                      <button
                        onClick={() => handleDeletePage(leftLeaf.docId!, leftLeaf.entryId)}
                        className="absolute bottom-2 right-2 p-2 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Delete Page"
                      >
                        Delete Page
                      </button>
                    </div>

                    <div className="text-[10px] border-t border-white/5 pt-2 flex justify-between items-center text-gray-500">
                      <span>Document Page {leftLeaf.position}</span>
                      <span className="font-semibold text-gray-400 italic">Click image to zoom</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="text-gray-500 text-center">Empty page</div>
              )}
            </div>

            {/* RIGHT LEAF */}
            <div className="bg-[#111122]/40 border border-white/5 rounded-2xl p-6 overflow-y-auto flex flex-col justify-between">
              {rightLeaf ? (
                rightLeaf.type === 'description' ? (
                  // Description leaf render
                  editingEntryId === rightLeaf.entryId ? (
                    // Edit mode
                    <div className="space-y-3.5 text-xs">
                      <div>
                        <label className="block text-gray-500 mb-1">Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Type</label>
                        <select
                          value={editType}
                          onChange={(e: any) => setEditType(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        >
                          <option value="Practice" className="bg-[#0e0e1a]">Practice</option>
                          <option value="Course Notes" className="bg-[#0e0e1a]">Course Notes</option>
                          <option value="Other" className="bg-[#0e0e1a]">Other</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-gray-500 mb-1">Notebook</label>
                          <select
                            value={editNotebookId}
                            onChange={(e) => {
                              setEditNotebookId(e.target.value);
                              setEditChapterId('');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                          >
                            {allNotebooks.map((n) => (
                              <option key={n.id} value={n.id} className="bg-[#0e0e1a]">{n.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-500 mb-1">Chapter</label>
                          <select
                            value={editChapterId}
                            onChange={(e) => setEditChapterId(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                          >
                            <option value="" className="bg-[#0e0e1a]">-- Unassigned --</option>
                            {editChaptersList.map((c: any) => (
                              <option key={c.id} value={c.id} className="bg-[#0e0e1a]">{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Description</label>
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Skills &amp; Concepts</label>
                        <textarea
                          value={editSkills}
                          onChange={(e) => setEditSkills(e.target.value)}
                          rows={1}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Question Log</label>
                        <textarea
                          value={editQuestionLog}
                          onChange={(e) => setEditQuestionLog(e.target.value)}
                          rows={1}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setEditingEntryId(null)}
                          className="flex-1 py-1.5 rounded-lg border border-white/10 font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 py-1.5 rounded-lg bg-indigo-500 font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Read mode description card
                    <div className="h-full flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold uppercase">
                            {rightLeaf.entry.entry_type}
                          </span>
                          <button
                            onClick={() => startEditing(rightLeaf)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                          >
                            Edit Entry
                          </button>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white leading-tight">{rightLeaf.entry.title}</h3>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Captured: {new Date(rightLeaf.entry.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed border-l-2 border-white/10 pl-3 italic">
                          {rightLeaf.entry.description}
                        </p>
                        {rightLeaf.entry.skills_and_concepts && (
                          <div>
                            <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Skills demonstrated</span>
                            <p className="text-xs text-gray-300 leading-relaxed">{rightLeaf.entry.skills_and_concepts}</p>
                          </div>
                        )}
                        {rightLeaf.entry.question_log && (
                          <div>
                            <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Question Log</span>
                            <p className="text-xs text-gray-300 leading-relaxed">{rightLeaf.entry.question_log}</p>
                          </div>
                        )}
                      </div>

                      {/* Document management tray */}
                      <div className="border-t border-white/5 pt-4 mt-6 flex justify-between items-center text-xs">
                        <span className="text-gray-500">Pages: {rightLeaf.entry.documents?.length || 0}</span>
                        
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingPageForEntry === rightLeaf.entryId}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.04] text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {uploadingPageForEntry === rightLeaf.entryId ? 'Adding...' : '+ Add Page'}
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={(e) => handleAddPage(e, rightLeaf.entry)}
                          className="hidden"
                        />
                      </div>
                    </div>
                  )
                ) : (
                  // Document Page leaf render
                  <div className="h-full flex flex-col justify-between">
                    <div className="flex-1 flex items-center justify-center relative group">
                      <img
                        src={rightLeaf.imageUrl}
                        alt={`Page leaf`}
                        onClick={() => setZoomImg(rightLeaf.imageUrl || null)}
                        className="max-h-[80%] max-w-full rounded-lg object-contain shadow-lg cursor-zoom-in transition-all group-hover:scale-[1.01]"
                      />
                      <button
                        onClick={() => handleDeletePage(rightLeaf.docId!, rightLeaf.entryId)}
                        className="absolute bottom-2 right-2 p-2 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Delete Page"
                      >
                        Delete Page
                      </button>
                    </div>

                    <div className="text-[10px] border-t border-white/5 pt-2 flex justify-between items-center text-gray-500">
                      <span>Document Page {rightLeaf.position}</span>
                      <span className="font-semibold text-gray-400 italic">Click image to zoom</span>
                    </div>
                  </div>
                )
              ) : (
                // End of chapter marker leaf
                <div className="h-full flex flex-col justify-center items-center text-center p-6 border-2 border-dashed border-white/5 rounded-2xl">
                  <svg className="w-10 h-10 text-indigo-500/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <h4 className="text-sm font-bold text-gray-300">End of Chapter</h4>
                  <p className="text-[10px] text-gray-500 mt-1 max-w-[160px]">
                    You have flipped through all documents in this section.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Book navigation controls */}
          <div className="flex gap-4 items-center justify-center mt-6">
            <button
              onClick={handleFlipBackward}
              disabled={leftIndex === 0}
              className="px-6 py-2.5 rounded-xl border border-white/10 hover:bg-white/[0.04] text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
            >
              &larr; Flip Back
            </button>
            <button
              onClick={handleFlipForward}
              disabled={leftIndex >= leaves.length}
              className="px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-indigo-500/10 transition-all"
            >
              Flip Forward &rarr;
            </button>
          </div>
        </section>
      )}

      {/* Fullscreen Zoom modal */}
      {zoomImg && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomImg(null)}
        >
          <img
            src={zoomImg}
            alt="Fullscreen zoom"
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
      <div className="h-6" />
    </main>
  );
}
