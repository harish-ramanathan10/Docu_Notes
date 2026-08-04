'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  getNotebooksAndChapters,
  renameChapter,
  deleteChapter,
  reorderChapters,
  unarchiveNotebook,
  deleteNotebook,
} from '../actions';

/* --- Inline icons, consistent with the rest of the app --- */
const ArrowLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const ChevronUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
  </svg>
);

const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
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

const ArchiveIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 8H3v13h18V8zM1 3h22v5H1V3zm8 8h6"
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

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  // Settings Category active tab
  const [activeTab, setActiveTab] = useState<'chapters' | 'archive' | 'account'>('chapters');

  // Notebook context for chapter manager
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState('');
  const [chapters, setChapters] = useState<any[]>([]);

  // Archived notebooks
  const [archivedNotebooks, setArchivedNotebooks] = useState<any[]>([]);

  // Account states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [updatingAccount, setUpdatingAccount] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit chapter states
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterName, setEditingChapterName] = useState('');

  // Load Notebooks & User data
  async function loadData() {
    try {
      const books = await getNotebooksAndChapters();
      setNotebooks(books);
      if (books.length > 0 && !selectedNotebookId) {
        setSelectedNotebookId(books[0].id);
      }

      const { data: archived } = await supabase
        .from('notebooks')
        .select('*')
        .eq('status', 'archived');
      setArchivedNotebooks(archived || []);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || '');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadChapters() {
    if (!selectedNotebookId) return;
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('notebook_id', selectedNotebookId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setChapters(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (window.innerWidth < 768) {
      router.push('/capture');
      return;
    }
    loadData();

    const handleResize = () => {
      if (window.innerWidth < 768) {
        router.push('/capture');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadChapters();
  }, [selectedNotebookId]);

  const handleRenameChapter = async (id: string) => {
    if (!editingChapterName.trim()) return;
    try {
      await renameChapter(id, editingChapterName);
      setEditingChapterId(null);
      await loadChapters();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteChapter = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this chapter? Entries inside it will be kept but unassigned.')) return;
    try {
      await deleteChapter(id);
      await loadChapters();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMoveChapter = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === chapters.length - 1) return;

    const newChaps = [...chapters];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = newChaps[index];
    newChaps[index] = newChaps[targetIdx];
    newChaps[targetIdx] = temp;

    const payload = newChaps.map((c, idx) => ({
      id: c.id,
      position: idx + 1,
    }));

    try {
      setChapters(newChaps);
      await reorderChapters(payload);
      await loadChapters();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await unarchiveNotebook(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm('This action cannot be undone. This permanently deletes the notebook, chapters, and all entry pages from storage. Continue?')) return;
    try {
      await deleteNotebook(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingAccount(true);
    setAccountMsg(null);

    try {
      const updates: any = {};
      if (email) updates.email = email;
      if (password) updates.password = password;

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      setAccountMsg({ type: 'success', text: 'Account updated successfully!' });
      setPassword('');
    } catch (err: any) {
      setAccountMsg({ type: 'error', text: err.message || 'Update failed.' });
    } finally {
      setUpdatingAccount(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const TAB_LABELS: Record<typeof activeTab, string> = {
    chapters: 'Chapter Management',
    archive: 'Archived Notebooks',
    account: 'Account Profile',
  };

  return (
    <main className="min-h-screen bg-[#F9F8F6] font-[Inter,sans-serif]">
      {/* Header bar */}
      <header className="border-b border-[#1C1C1C]/10 bg-white px-8 py-4 flex items-center">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#797676] hover:text-[#1C1C1C] transition-all duration-200 ease-out cursor-pointer"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to Shelf
        </button>
      </header>

      {/* Settings Grid */}
      <section className="max-w-4xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left Side Tab Navigation */}
        <div className="md:col-span-1 space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-[#1C1C1C] font-[\'Source_Serif_4\',serif] mb-4 px-1">
            Settings
          </h2>
          {(Object.keys(TAB_LABELS) as Array<typeof activeTab>).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-3 rounded-md text-xs font-semibold transition-all duration-200 ease-out cursor-pointer ${
                activeTab === tab
                  ? 'bg-[#1C1C1C] text-white'
                  : 'text-[#797676] hover:text-[#1C1C1C] hover:bg-white'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Right Side Content Body */}
        <div className="md:col-span-3">
          {/* TAB 1: Chapter Management */}
          {activeTab === 'chapters' && (
            <div className="bg-white border border-[#1C1C1C]/10 p-6 rounded-md space-y-6">
              <h3 className="text-lg font-bold text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
                Chapter Management
              </h3>

              <div>
                <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-2 font-bold ml-0.5">
                  Notebook
                </label>
                <select
                  value={selectedNotebookId}
                  onChange={(e) => setSelectedNotebookId(e.target.value)}
                  className="w-full max-w-xs px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-xs focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
                >
                  <option value="">-- Select Notebook --</option>
                  {notebooks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>

              {chapters.length === 0 ? (
                <div className="border border-[#1C1C1C]/10 bg-[#F9F8F6] rounded-md p-8 text-left text-[#797676] text-xs">
                  No chapters found in this notebook.
                </div>
              ) : (
                <div className="space-y-2">
                  {chapters.map((chapter, idx) => (
                    <div
                      key={chapter.id}
                      className="p-4 bg-[#F9F8F6] border border-[#1C1C1C]/10 rounded-md flex items-center justify-between text-xs"
                    >
                      {editingChapterId === chapter.id ? (
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            value={editingChapterName}
                            onChange={(e) => setEditingChapterName(e.target.value)}
                            autoFocus
                            className="flex-1 px-3 py-1.5 rounded-md bg-white border border-[#8E8E93]/30 text-[#1C1C1C] focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
                          />
                          <button
                            onClick={() => handleRenameChapter(chapter.id)}
                            className="px-3 py-1.5 bg-[#1C1C1C] hover:opacity-90 rounded-md text-white font-semibold transition-all duration-200 ease-out cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingChapterId(null)}
                            className="px-3 py-1.5 border border-[#1C1C1C]/15 rounded-md text-[#797676] hover:text-[#1C1C1C] hover:bg-white transition-all duration-200 ease-out cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="font-semibold text-[#1C1C1C]">
                            {chapter.name}{' '}
                            <span className="text-[10px] text-[#8E8E93] font-normal">
                              (Pos: {chapter.position})
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleMoveChapter(idx, 'up')}
                              disabled={idx === 0}
                              aria-label="Move up"
                              className="w-7 h-7 rounded-md border border-[#1C1C1C]/10 bg-white flex items-center justify-center text-[#797676] hover:text-[#1C1C1C] hover:bg-[#F9F8F6] disabled:opacity-25 transition-all duration-200 ease-out cursor-pointer"
                            >
                              <ChevronUpIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveChapter(idx, 'down')}
                              disabled={idx === chapters.length - 1}
                              aria-label="Move down"
                              className="w-7 h-7 rounded-md border border-[#1C1C1C]/10 bg-white flex items-center justify-center text-[#797676] hover:text-[#1C1C1C] hover:bg-[#F9F8F6] disabled:opacity-25 transition-all duration-200 ease-out cursor-pointer"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingChapterId(chapter.id);
                                setEditingChapterName(chapter.name);
                              }}
                              aria-label="Rename chapter"
                              className="w-7 h-7 rounded-md bg-[#1C1C1C] flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteChapter(chapter.id)}
                              aria-label="Delete chapter"
                              className="w-7 h-7 rounded-md bg-[#B3261E] flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Archived Notebooks */}
          {activeTab === 'archive' && (
            <div className="bg-white border border-[#1C1C1C]/10 p-6 rounded-md space-y-6">
              <h3 className="text-lg font-bold text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
                Archived Notebooks
              </h3>

              {archivedNotebooks.length === 0 ? (
                <div className="border border-[#1C1C1C]/10 bg-[#F9F8F6] rounded-md p-8 flex flex-col items-start text-left">
                  <ArchiveIcon className="w-8 h-8 text-[#8E8E93] mb-3" />
                  <p className="text-xs text-[#797676]">No archived notebooks found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {archivedNotebooks.map((notebook) => (
                    <div
                      key={notebook.id}
                      className="p-5 bg-[#F9F8F6] border border-[#1C1C1C]/10 rounded-md flex items-center justify-between text-xs"
                    >
                      <div>
                        <h4 className="font-bold text-[#1C1C1C] text-sm">{notebook.name}</h4>
                        <p className="text-[10px] text-[#8E8E93] mt-1">
                          Archived on {new Date(notebook.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUnarchive(notebook.id)}
                          className="px-3 py-1.5 rounded-md border border-[#1C1C1C]/15 bg-white hover:bg-[#F9F8F6] text-xs font-semibold text-[#1C1C1C] transition-all duration-200 ease-out cursor-pointer"
                        >
                          Unarchive
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(notebook.id)}
                          className="px-3 py-1.5 rounded-md bg-[#B3261E] hover:opacity-90 text-xs font-semibold text-white transition-all duration-200 ease-out cursor-pointer"
                        >
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Account Profile */}
          {activeTab === 'account' && (
            <div className="bg-white border border-[#1C1C1C]/10 p-6 rounded-md space-y-6">
              <h3 className="text-lg font-bold text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
                Account Profile
              </h3>

              {accountMsg && (
                <div
                  className={`p-3 rounded-md text-xs border ${
                    accountMsg.type === 'success'
                      ? 'bg-[#F9F8F6] border-[#1C1C1C]/15 text-[#1C1C1C]'
                      : 'bg-[#F9F8F6] border-[#B3261E]/30 text-[#B3261E]'
                  }`}
                >
                  {accountMsg.text}
                </div>
              )}

              <form onSubmit={handleUpdateAccount} className="space-y-4">
                <div className="max-w-sm">
                  <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-xs focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
                  />
                </div>

                <div className="max-w-sm">
                  <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                    Change Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter new password (optional)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] placeholder-[#8E8E93] text-xs focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updatingAccount}
                  className="px-5 py-2.5 rounded-md bg-[#1C1C1C] hover:opacity-90 disabled:opacity-50 text-xs font-semibold text-white transition-all duration-200 ease-out cursor-pointer"
                >
                  {updatingAccount ? 'Updating...' : 'Update Settings'}
                </button>
              </form>

              <div className="border-t border-[#1C1C1C]/10 pt-6 max-w-sm">
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#B3261E] hover:opacity-90 text-xs font-semibold text-white transition-all duration-200 ease-out cursor-pointer"
                >
                  <LogOutIcon className="w-3.5 h-3.5" />
                  Log Out
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}