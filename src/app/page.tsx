'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { createNotebook } from './actions';

/* --- Inline icons (no external icon lib dependency) --- */
const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="11" cy="11" r="7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
    />
  </svg>
);

const LogOutIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
    />
  </svg>
);

const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
);

const PencilIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
    />
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

const BookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  </svg>
);

/* --- Deterministic cover pattern, derived from the notebook's first letter ---
   No database column needed: A-Z map onto a fixed cycle of patterns, so the
   same name always renders the same pattern. Six line-based patterns only:
   crosshatch, horizontal, vertical, diagonal, diagonal (reverse), medium grid.
   All share the same 1.5px stroke weight; only the grid uses a larger cell
   size since two crossing directions read denser at the same spacing. */
const PATTERN_SPACING = 16; // px — shared tile size for lines/crosshatch
const PATTERN_WEIGHT = 1.5; // px — shared line thickness
const GRID_SPACING = 24; // px — medium grid cell size (larger since two directions overlap)

const COVER_PATTERNS: React.CSSProperties[] = [
  // crosshatch (two diagonals overlaid) — same box spacing as the medium grid
  {
    backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${GRID_SPACING}px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${GRID_SPACING}px)`,
  },
  // horizontal lines
  {
    backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${PATTERN_SPACING}px)`,
  },
  // vertical lines
  {
    backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${PATTERN_SPACING}px)`,
  },
  // diagonal lines
  {
    backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${PATTERN_SPACING}px)`,
  },
  // diagonal lines, other way
  {
    backgroundImage: `repeating-linear-gradient(-45deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${PATTERN_SPACING}px)`,
  },
  // medium grid
  {
    backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${GRID_SPACING}px), repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) ${PATTERN_WEIGHT}px, transparent ${PATTERN_WEIGHT}px, transparent ${GRID_SPACING}px)`,
  },
];

function getCoverPattern(name: string): React.CSSProperties {
  const trimmed = (name || '').trim();
  const letter = trimmed.charAt(0).toUpperCase();
  const letterCode = letter ? letter.charCodeAt(0) - 65 : 0; // A=0, B=1, ...
  const letterCount = trimmed.replace(/\s/g, '').length; // total letters, spaces ignored
  const idx =
    ((letterCode + letterCount) % COVER_PATTERNS.length + COVER_PATTERNS.length) %
    COVER_PATTERNS.length;
  return COVER_PATTERNS[idx];
}

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  const [activeNotebooks, setActiveNotebooks] = useState<any[]>([]);
  const [archivedNotebooks, setArchivedNotebooks] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Notebook creation states
  const [showNewModal, setShowNewModal] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadNotebooks() {
    setLoading(true);
    try {
      const { data: active, error: activeErr } = await supabase
        .from('notebooks')
        .select('*, chapters(id), entries(id, documents(id))')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (activeErr) throw activeErr;

      const { data: archived, error: archErr } = await supabase
        .from('notebooks')
        .select('*, chapters(id), entries(id, documents(id))')
        .eq('status', 'archived')
        .order('created_at', { ascending: false });

      if (archErr) throw archErr;

      setActiveNotebooks(active || []);
      setArchivedNotebooks(archived || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      // Client-side mobile redirect: if screen is small, redirect to capture page
      if (window.innerWidth < 768) {
        router.push('/capture');
        return;
      }
      await loadNotebooks();
    }
    init();

    const handleResize = () => {
      if (window.innerWidth < 768) {
        router.push('/capture');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCreateNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookName.trim()) return;
    setCreating(true);
    try {
      await createNotebook(newBookName);
      setNewBookName('');
      setShowNewModal(false);
      await loadNotebooks();
    } catch (err) {
      console.error('Failed to create notebook:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const displayedNotebooks = (showArchived ? archivedNotebooks : activeNotebooks).filter((n) =>
    n.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#F9F8F6] font-[Inter,sans-serif]">
      {/* Header bar */}
      <header className="border-b border-[#1C1C1C]/10 bg-white px-8 py-4 flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
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
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md relative">
          <SearchIcon className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notebooks"
            className="w-full pl-10 pr-4 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/25 text-sm text-[#1C1C1C] placeholder-[#8E8E93] focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={() => router.push('/settings')}
            aria-label="Settings"
            className="w-10 h-10 rounded-md border border-[#1C1C1C]/10 flex items-center justify-center text-[#1C1C1C] hover:bg-[#F9F8F6] transition-all duration-200 ease-out cursor-pointer"
          >
            <SettingsIcon className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="w-10 h-10 rounded-md bg-[#1C1C1C] flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
          >
            <LogOutIcon className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Main body */}
      <section className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
            {showArchived ? 'Archived' : 'My Notebooks'}
          </h2>

          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => setShowArchived(false)}
              className={`pb-1 border-b-2 font-semibold transition-all duration-200 ease-out cursor-pointer ${
                !showArchived
                  ? 'border-[#1C1C1C] text-[#1C1C1C]'
                  : 'border-transparent text-[#8E8E93] hover:text-[#1C1C1C]'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`pb-1 border-b-2 font-semibold transition-all duration-200 ease-out cursor-pointer ${
                showArchived
                  ? 'border-[#1C1C1C] text-[#1C1C1C]'
                  : 'border-transparent text-[#8E8E93] hover:text-[#1C1C1C]'
              }`}
            >
              Archived
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-56 rounded-md bg-white border border-[#1C1C1C]/5 animate-pulse" />
            ))}
          </div>
        ) : displayedNotebooks.length === 0 ? (
          <div className="border border-[#1C1C1C]/10 bg-white rounded-md p-12 max-w-xl mt-4 flex flex-col items-start">
            <BookIcon className="w-10 h-10 text-[#8E8E93] mb-4" />
            <h3 className="text-lg font-bold text-[#1C1C1C]">No notebooks yet</h3>
            {!showArchived && (
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-6 px-5 py-2.5 rounded-md bg-[#1C1C1C] font-semibold text-xs text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer inline-flex items-center gap-1.5"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                New Notebook
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {displayedNotebooks.map((notebook) => {
              const chapCount = notebook.chapters?.length || 0;
              const entryCount = notebook.entries?.length || 0;
              const pageCount =
                notebook.entries?.reduce(
                  (acc: number, entry: any) => acc + (entry.documents?.length || 0),
                  0
                ) || 0;

              return (
                <div
                  key={notebook.id}
                  onClick={() => router.push(`/notebook/${notebook.id}`)}
                  className="group relative h-56 bg-white border border-[#1C1C1C]/10 rounded-md overflow-hidden flex flex-col hover:border-[#1C1C1C] hover:shadow-[0_4px_0_0_#1C1C1C] transition-all duration-200 ease-out cursor-pointer"
                >
                  {/* Hover actions */}
                  <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out z-10">
                    <button
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Edit notebook"
                      className="w-7 h-7 rounded-md bg-white flex items-center justify-center text-[#1C1C1C] hover:opacity-80 transition-all duration-200 ease-out cursor-pointer"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Delete notebook"
                      className="w-7 h-7 rounded-md bg-[#B3261E] flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* "Cover" */}
                  <div
                    className="relative flex-1 bg-[#1C1C1C] px-6 py-5 flex flex-col justify-between"
                    style={getCoverPattern(notebook.name)}
                  >
                    <BookIcon className="w-6 h-6 text-white/35" />
                    <h3 className="text-2xl font-bold text-white font-[\'Source_Serif_4\',serif] leading-tight line-clamp-3 pr-2">
                      {notebook.name}
                    </h3>
                  </div>

                  {/* "Label" footer */}
                  <div className="px-6 py-3.5 bg-white flex items-center">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1C1C1C] bg-[#F9F8F6] border border-[#1C1C1C]/10 px-2.5 py-1 rounded-md">
                      {chapCount} {chapCount === 1 ? 'Chapter' : 'Chapters'}
                    </span>
                  </div>
                </div>
              );
            })}

            {!showArchived && (
              <button
                onClick={() => setShowNewModal(true)}
                className="border border-dashed border-[#8E8E93]/50 hover:border-[#1C1C1C] rounded-md h-56 flex flex-col justify-center items-center text-[#8E8E93] hover:text-[#1C1C1C] transition-all duration-200 ease-out bg-transparent cursor-pointer"
              >
                <div className="w-9 h-9 rounded-md border border-dashed border-current flex items-center justify-center mb-2.5">
                  <PlusIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold">New Notebook</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Creation Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-[#1C1C1C]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#1C1C1C]/10 rounded-md p-8 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-[#1C1C1C] font-[\'Source_Serif_4\',serif] mb-6">
              Create Notebook
            </h3>

            <form onSubmit={handleCreateNotebook} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                placeholder="Notebook title"
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                className="w-full px-4 py-3 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] placeholder-[#8E8E93] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-3 rounded-md border border-[#1C1C1C]/15 hover:bg-[#F9F8F6] text-xs font-semibold text-[#1C1C1C] transition-all duration-200 ease-out cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 rounded-md bg-[#1C1C1C] disabled:opacity-50 text-xs font-semibold text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}