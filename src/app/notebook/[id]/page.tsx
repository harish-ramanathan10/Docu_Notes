'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  createChapter,
  archiveNotebook,
  unarchiveNotebook,
  deleteNotebook,
  searchNotebook,
  SearchResult,
} from '../../actions';

/* --- Inline icons, consistent with the rest of the app --- */
const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="11" cy="11" r="7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
);

const ArchiveIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8H3v13h18V8zM1 3h22v5H1V3zm8 8h6" />
  </svg>
);

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
    />
  </svg>
);

export default function NotebookDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const supabase = createClient();

  const [notebook, setNotebook] = useState<any | null>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [showNewChapterModal, setShowNewChapterModal] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [creatingChapter, setCreatingChapter] = useState(false);

  async function loadNotebookData() {
    setLoading(true);
    try {
      const { data: book, error: bookErr } = await supabase
        .from('notebooks')
        .select('*, entries(id, documents(id))')
        .eq('id', id)
        .single();

      if (bookErr) throw bookErr;

      const { data: chaps, error: chapsErr } = await supabase
        .from('chapters')
        .select('*, entries(id, documents(id))')
        .eq('notebook_id', id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (chapsErr) throw chapsErr;

      setNotebook(book);
      setChapters(chaps || []);
    } catch (err) {
      console.error(err);
      router.push('/');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (window.innerWidth < 768) {
      router.push('/capture');
      return;
    }
    if (id) loadNotebookData();

    const handleResize = () => {
      if (window.innerWidth < 768) {
        router.push('/capture');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [id]);

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterName.trim()) return;
    setCreatingChapter(true);
    try {
      const pos = chapters.length + 1;
      await createChapter(id, newChapterName, pos);
      setNewChapterName('');
      setShowNewChapterModal(false);
      await loadNotebookData();
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingChapter(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!notebook) return;
    try {
      if (notebook.status === 'active') {
        await archiveNotebook(notebook.id);
      } else {
        await unarchiveNotebook(notebook.id);
      }
      await loadNotebookData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotebook = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this notebook and all its entries?')) return;
    try {
      await deleteNotebook(id);
      router.push('/');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    setShowResults(true);
    try {
      const hits = await searchNotebook(id, searchQuery);
      setSearchResults(hits);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center font-[Inter,sans-serif]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#1C1C1C]/15 border-t-[#1C1C1C]" />
      </div>
    );
  }

  if (!notebook) return null;

  const totalPages =
    notebook.entries?.reduce((acc: number, e: any) => acc + (e.documents?.length || 0), 0) || 0;

  return (
    <main className="min-h-screen bg-[#F9F8F6] font-[Inter,sans-serif]">
      {/* Header bar — same height/padding/logo treatment as the dashboard */}
      <header className="border-b border-[#1C1C1C]/10 bg-white px-8 py-4 flex items-center gap-6">
        {/* Logo + wordmark, same styling as dashboard */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer"
        >
          <div
            role="img"
            aria-label="DocuNotes logo"
            className="w-7 h-7 bg-[#1C1C1C] shrink-0"
            style={{
              WebkitMaskImage: 'url(/DocuNotesLogo.png)',
              maskImage: 'url(/DocuNotesLogo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
          <h1 className="text-xl font-bold tracking-tight text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
            DocuNotes
          </h1>
        </button>

        {/* Search */}
        <div className="flex-1 max-w-md relative">
          <form onSubmit={handleSearch}>
            <SearchIcon className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search this notebook"
              className="w-full pl-10 pr-4 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-sm text-[#1C1C1C] placeholder-[#8E8E93] focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
            />
          </form>

          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#1C1C1C]/10 rounded-md shadow-xl max-h-[50vh] overflow-y-auto z-20">
              {searchResults.length > 0 ? (
                <div className="p-2">
                  <div className="flex justify-between items-center px-2 py-1.5 text-xs text-[#8E8E93]">
                    <span>{searchResults.length} match{searchResults.length === 1 ? '' : 'es'}</span>
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="text-[#1C1C1C] font-semibold hover:opacity-70 transition-all duration-200 ease-out cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  {searchResults.map((hit, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (hit.chapterId) {
                          router.push(`/notebook/${notebook.id}/chapter/${hit.chapterId}?leaf=${hit.leafIndex}`);
                        }
                      }}
                      className="px-3 py-2.5 rounded-md hover:bg-[#F9F8F6] transition-all duration-200 ease-out cursor-pointer text-left"
                    >
                      <div className="text-sm font-semibold text-[#1C1C1C] truncate">{hit.entryTitle}</div>
                      <div className="text-xs text-[#797676] mt-0.5 line-clamp-2 leading-relaxed">
                        {hit.matchedSnippet}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !searching && (
                  <div className="text-xs text-[#8E8E93] text-center py-4">
                    No results found inside this notebook.
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Right-side button cluster: Back to Shelf, Archive, Delete */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-[#1C1C1C]/10 text-sm font-semibold text-[#1C1C1C] hover:bg-[#F9F8F6] transition-all duration-200 ease-out cursor-pointer"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Shelf
          </button>
          <button
            onClick={handleArchiveToggle}
            aria-label={notebook.status === 'active' ? 'Archive notebook' : 'Unarchive notebook'}
            title={notebook.status === 'active' ? 'Archive' : 'Unarchive'}
            className="w-10 h-10 rounded-md border border-[#1C1C1C]/10 flex items-center justify-center text-[#1C1C1C] hover:bg-[#F9F8F6] transition-all duration-200 ease-out cursor-pointer"
          >
            <ArchiveIcon className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={handleDeleteNotebook}
            aria-label="Delete notebook"
            title="Delete"
            className="w-10 h-10 rounded-md bg-[#B3261E] flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
          >
            <TrashIcon className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Linear body */}
      <section className="max-w-6xl mx-auto px-8 py-10 space-y-10">
        {/* Table of Contents — sole page heading, same styling as dashboard's page title */}
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-bold tracking-tight text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
              Table of Contents
            </h3>
            <button
              onClick={() => setShowNewChapterModal(true)}
              className="px-4 py-2.5 rounded-md bg-[#1C1C1C] text-sm font-semibold text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer inline-flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              Add Chapter
            </button>
          </div>

          {chapters.length === 0 ? (
            <div className="border border-[#1C1C1C]/10 bg-white rounded-md p-12 flex flex-col items-start">
              <p className="text-base text-[#797676] mb-5">This notebook doesn't have any chapters yet.</p>
              <button
                onClick={() => setShowNewChapterModal(true)}
                className="px-5 py-2.5 rounded-md bg-[#1C1C1C] text-sm font-semibold text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
              >
                Create Chapter 1
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {chapters.map((chapter) => {
                const chapPages =
                  chapter.entries?.reduce((acc: number, e: any) => acc + (e.documents?.length || 0), 0) || 0;

                return (
                  <div
                    key={chapter.id}
                    onClick={() => router.push(`/notebook/${id}/chapter/${chapter.id}`)}
                    className="p-7 bg-white border border-[#1C1C1C]/10 rounded-md hover:border-[#1C1C1C] hover:shadow-[0_4px_0_0_#1C1C1C] transition-all duration-200 ease-out flex items-center justify-between cursor-pointer"
                  >
                    <h4 className="text-lg font-bold text-[#1C1C1C]">{chapter.name}</h4>

                    <div className="text-right">
                      <span className="block text-[#1C1C1C] font-bold text-base">{chapPages}</span>
                      <span className="text-[10px] uppercase text-[#8E8E93]">Pages</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Chapter Creation Modal */}
      {showNewChapterModal && (
        <div className="fixed inset-0 z-50 bg-[#1C1C1C]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#1C1C1C]/10 rounded-md p-8 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-[#1C1C1C] font-[\'Source_Serif_4\',serif] mb-6">
              Create Chapter
            </h3>

            <form onSubmit={handleCreateChapter} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                placeholder="Chapter title"
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                className="w-full px-4 py-3 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] placeholder-[#8E8E93] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewChapterModal(false)}
                  className="flex-1 py-3 rounded-md border border-[#1C1C1C]/15 hover:bg-[#F9F8F6] text-sm font-semibold text-[#1C1C1C] transition-all duration-200 ease-out cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingChapter}
                  className="flex-1 py-3 rounded-md bg-[#1C1C1C] disabled:opacity-50 text-sm font-semibold text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                >
                  {creatingChapter ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}