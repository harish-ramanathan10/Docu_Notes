'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import imageCompression from 'browser-image-compression';
import { createClient } from '@/utils/supabase/client';
import {
  getNotebooksAndChapters,
  getExistingEntries,
  saveNewEntry,
  appendToExistingEntry,
} from './actions';

interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
  compressedSizeKb: number;
  originalSizeKb: number;
}

interface AIResult {
  raw_text_per_page: string[];
  entry_type: 'Practice' | 'Course Notes' | 'Other';
  notebook_id: string | null;
  chapter_id: string | null;
  title: string;
  description: string;
  skills_and_concepts: string;
  concepts_discussed: string;
  question_log: string;
}

export default function CapturePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Desktop check redirect
  useEffect(() => {
    const checkDevice = () => {
      if (window.innerWidth >= 768) {
        router.push('/');
      }
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, [router]);

  // App States
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bottom drawer for reviewing staged list
  const [showStagedDrawer, setShowStagedDrawer] = useState(false);

  // Db Context States
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [existingEntries, setExistingEntries] = useState<any[]>([]);
  const [targetMode, setTargetMode] = useState<'new' | 'append'>('new');
  const [targetEntryId, setTargetEntryId] = useState<string>('');

  // AI & Form Fields State
  const [aiData, setAiData] = useState<AIResult | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<'Practice' | 'Course Notes' | 'Other'>('Other');
  const [formNotebookId, setFormNotebookId] = useState<string>('');
  const [formChapterId, setFormChapterId] = useState<string>('');
  const [formSkills, setFormSkills] = useState('');
  const [formConcepts, setFormConcepts] = useState('');
  const [formQuestionLog, setFormQuestionLog] = useState('');
  const [rawTexts, setRawTexts] = useState<string[]>([]);
  const [expandedRawTextIndex, setExpandedRawTextIndex] = useState<number | null>(null);

  // Load Notebooks & Entries for Dropdowns
  useEffect(() => {
    async function loadData() {
      try {
        const books = await getNotebooksAndChapters();
        setNotebooks(books);
        const entries = await getExistingEntries();
        setExistingEntries(entries);
      } catch (err: any) {
        console.error('Failed to load contextual db data', err);
      }
    }
    loadData();
  }, []);

  // Handle image capture and compression
  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const compressedImages: StagedImage[] = [];

    for (const file of files) {
      const originalSize = Math.round(file.size / 1024);
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1800,
        useWebWorker: true,
        fileType: 'image/jpeg',
      };

      try {
        const compressedFile = await imageCompression(file, options);
        const compressedSize = Math.round(compressedFile.size / 1024);

        compressedImages.push({
          id: Math.random().toString(36).substring(2, 9),
          file: compressedFile,
          previewUrl: URL.createObjectURL(compressedFile),
          compressedSizeKb: compressedSize,
          originalSizeKb: originalSize,
        });
      } catch (error) {
        console.error('Compression failed:', error);
        setErrorMsg('Compression failed.');
      }
    }

    setStagedImages((prev) => [...prev, ...compressedImages]);
  };

  const removeStagedImage = (id: string) => {
    setStagedImages((prev) => {
      const imageToRemove = prev.find((img) => img.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.previewUrl);
      }
      const updated = prev.filter((img) => img.id !== id);
      if (updated.length === 0) {
        setShowStagedDrawer(false);
      }
      return updated;
    });
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === stagedImages.length - 1) return;

    const newImages = [...stagedImages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newImages[index];
    newImages[index] = newImages[targetIndex];
    newImages[targetIndex] = temp;
    setStagedImages(newImages);
  };

  // Upload compressed images to storage, run Gemini pipeline
  const processCapturedPages = async () => {
    if (stagedImages.length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setShowStagedDrawer(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthorized');

      const uploadedPaths: string[] = [];

      // 1. Upload files
      for (let i = 0; i < stagedImages.length; i++) {
        const image = stagedImages[i];
        const fileName = `${user.id}/${Date.now()}_page_${i + 1}.jpg`;

        const { data, error } = await supabase.storage
          .from('page-images')
          .upload(fileName, image.file, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (error) throw error;
        uploadedPaths.push(data.path);
      }

      // 2. Call process API
      const res = await fetch('/api/process-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePaths: uploadedPaths }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to analyze notes');

      const result: AIResult = json.data;

      // 3. Pre-populate review forms
      setAiData(result);
      setFormTitle(result.title || '');
      setFormDescription(result.description || '');
      setFormType(result.entry_type || 'Other');
      setFormNotebookId(result.notebook_id || '');
      setFormChapterId(result.chapter_id || '');
      setFormSkills(result.skills_and_concepts || '');
      setFormConcepts(result.concepts_discussed || '');
      setFormQuestionLog(result.question_log || '');
      setRawTexts(result.raw_text_per_page || []);

      setStagedImages(
        stagedImages.map((img, idx) => ({
          ...img,
          previewUrl: uploadedPaths[idx],
        }))
      );

      setStep('review');
    } catch (err: any) {
      setErrorMsg(err.message || 'Processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEntry = async () => {
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const documentsInput = stagedImages.map((img, idx) => ({
        imageUrl: img.previewUrl,
        rawText: rawTexts[idx] || '',
        position: idx + 1,
      }));

      if (targetMode === 'new') {
        await saveNewEntry({
          notebookId: formNotebookId,
          chapterId: formChapterId || null,
          entryType: formType,
          title: formTitle,
          description: formDescription,
          skillsAndConcepts: formSkills,
          conceptsDiscussed: formConcepts,
          questionLog: formQuestionLog,
          documents: documentsInput,
        });
      } else {
        if (!targetEntryId) throw new Error('Please select an entry to append to.');
        await appendToExistingEntry({
          entryId: targetEntryId,
          documents: documentsInput,
          updatedFields: {
            notebookId: formNotebookId,
            chapterId: formChapterId || null,
            entryType: formType,
            title: formTitle,
            description: formDescription,
            skillsAndConcepts: formSkills,
            conceptsDiscussed: formConcepts,
            questionLog: formQuestionLog,
          },
        });
      }

      // Clear staged images state
      setStagedImages([]);
      setStep('capture');
      setAiData(null);
      setErrorMsg(null);
      alert('Entry saved and uploaded successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Saving entry failed.');
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const activeNotebook = notebooks.find((n) => n.id === formNotebookId);
  const availableChapters = activeNotebook?.chapters || [];

  return (
    <main className="relative min-h-screen h-screen bg-black text-white font-sans overflow-hidden flex flex-col justify-between select-none">
      
      {/* 1. CAMERA INTERFACE (Step: capture) */}
      {step === 'capture' && (
        <div className="flex-1 flex flex-col justify-between h-full relative">
          
          {/* Top Controls Overlay */}
          <header className="px-6 py-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                LITE-CAMERA
              </span>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleLogout}
                className="text-xs font-semibold text-gray-400 hover:text-white"
              >
                Log Out
              </button>
            </div>
          </header>

          {/* Viewfinder Placeholder (US Letter Aspect Ratio 8.5 x 11) */}
          <div className="flex-1 flex flex-col justify-center items-center relative px-8">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border border-white/20 hover:border-indigo-500/40 w-full aspect-[8.5/11] max-h-[50vh] rounded-2xl flex flex-col items-center justify-center relative overflow-hidden bg-zinc-950/60 shadow-lg cursor-pointer transition-all duration-300 group"
            >
              {/* Camera Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                <div className="border-r border-b border-white/5" />
                <div className="border-r border-b border-white/5" />
                <div className="border-b border-white/5" />
                <div className="border-r border-b border-white/5" />
                <div className="border-r border-b border-white/5" />
                <div className="border-b border-white/5" />
                <div className="border-r border-white/5" />
                <div className="border-r border-white/5" />
                <div className="border-none" />
              </div>

              {/* Viewfinder text banner */}
              <span className="text-[10px] text-gray-500 group-hover:text-gray-300 font-bold uppercase tracking-widest absolute top-3 transition-colors">
                Tap to Open Camera (Letter Size)
              </span>

              {stagedImages.length > 0 ? (
                <img
                  src={stagedImages[stagedImages.length - 1].previewUrl}
                  alt="Last captured page"
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="text-center text-zinc-700 group-hover:text-zinc-500 px-6 transition-colors">
                  <svg className="w-12 h-12 mx-auto mb-2 text-zinc-800 group-hover:text-zinc-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  <p className="text-xs font-semibold">Tap here to scan document page</p>
                </div>
              )}

              {errorMsg && (
                <div className="absolute bottom-4 left-4 right-4 p-2 bg-rose-500/80 rounded-lg text-[10px] text-center font-bold">
                  {errorMsg}
                </div>
              )}

              {isProcessing && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                  <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs font-semibold text-indigo-300">Reading Handwritings...</span>
                </div>
              )}
            </div>
          </div>

          {/* Camera Controls Panel */}
          <div className="bg-black px-6 pb-8 pt-4 flex flex-col justify-end space-y-6">
            
            {/* 1. Camera Mode Slider (New Entry vs Append) */}
            <div className="flex justify-center items-center gap-6 text-xs font-bold tracking-widest text-zinc-500 relative">
              <button
                type="button"
                onClick={() => setTargetMode('new')}
                className={`transition-colors py-1 ${targetMode === 'new' ? 'text-indigo-400 font-extrabold' : 'hover:text-zinc-300'}`}
              >
                NEW NOTE
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('append')}
                className={`transition-colors py-1 ${targetMode === 'append' ? 'text-indigo-400 font-extrabold' : 'hover:text-zinc-300'}`}
              >
                APPEND
              </button>
            </div>

            {targetMode === 'append' && (
              <div className="animate-fade-in w-full max-w-xs mx-auto">
                <select
                  value={targetEntryId}
                  onChange={(e) => setTargetEntryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Append to which Entry? --</option>
                  {existingEntries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 2. Controls */}
            <div className="flex justify-between items-center max-w-xs w-full mx-auto">
              
              {/* Left Button: Gallery Thumbnail Preview */}
              <div className="w-12 h-12 flex items-center justify-center">
                {stagedImages.length > 0 ? (
                  <button
                    onClick={() => setShowStagedDrawer(true)}
                    className="relative w-11 h-11 rounded-full border border-white/20 overflow-hidden active:scale-95 transition-transform"
                  >
                    <img
                      src={stagedImages[stagedImages.length - 1].previewUrl}
                      alt="Last page thumbnail"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border border-black shadow">
                      {stagedImages.length}
                    </span>
                  </button>
                ) : (
                  <div className="w-11 h-11 rounded-full bg-zinc-900 border border-white/5" />
                )}
              </div>

              {/* Center status message */}
              <div className="text-[10px] text-zinc-600 font-semibold tracking-wider text-center uppercase">
                Tap paper to scan
              </div>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                ref={fileInputRef}
                onChange={handleImageCapture}
                className="hidden"
              />

              {/* Right Button: Process Checkmark */}
              <div className="w-12 h-12 flex items-center justify-center">
                <button
                  onClick={processCapturedPages}
                  disabled={stagedImages.length === 0 || isProcessing}
                  className="w-11 h-11 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center hover:bg-indigo-500/30 text-indigo-400 disabled:opacity-20 transition-all cursor-pointer"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>

            </div>
          </div>

          {/* Bottom staged review sheet drawer */}
          {showStagedDrawer && (
            <div className="fixed inset-0 z-30 bg-black/90 backdrop-blur-sm flex flex-col justify-end">
              <div className="bg-zinc-950 border-t border-white/10 rounded-t-3xl p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-300">Staged Pages ({stagedImages.length})</h3>
                  <button
                    onClick={() => setShowStagedDrawer(false)}
                    className="text-xs text-indigo-400 font-semibold"
                  >
                    Done
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {stagedImages.map((img, index) => (
                    <div
                      key={img.id}
                      className="relative bg-zinc-900 border border-white/5 rounded-xl p-2 flex flex-col justify-between"
                    >
                      <img
                        src={img.previewUrl}
                        alt={`Page preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <span className="absolute top-4 left-4 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-bold">
                        Page {index + 1}
                      </span>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[9px] text-zinc-500">
                          {img.compressedSizeKb}KB
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveImage(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded bg-white/5 text-gray-400 disabled:opacity-20"
                          >
                            &larr;
                          </button>
                          <button
                            onClick={() => moveImage(index, 'down')}
                            disabled={index === stagedImages.length - 1}
                            className="p-1 rounded bg-white/5 text-gray-400 disabled:opacity-20"
                          >
                            &rarr;
                          </button>
                          <button
                            onClick={() => removeStagedImage(img.id)}
                            className="p-1 rounded bg-rose-500/10 text-rose-400"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* 2. AI REVIEW SCREEN (Step: review) */}
      {step === 'review' && aiData && (
        <div className="flex-1 flex flex-col justify-between h-full bg-[#0a0a14] p-5">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-indigo-300">Review AI Tagging</h2>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto max-h-[72vh] pr-1">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Title</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-bold ml-1">Type</label>
              <div className="flex gap-2 text-xs">
                {['Practice', 'Course Notes', 'Other'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormType(type as any)}
                    className={`flex-1 py-2 rounded-lg border transition-all font-semibold ${
                      formType === type
                        ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300'
                        : 'bg-transparent border-white/10 text-gray-400'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Notebook</label>
              <select
                value={formNotebookId}
                onChange={(e) => {
                  setFormNotebookId(e.target.value);
                  setFormChapterId('');
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="" className="bg-[#0e0e1a]">-- Unassigned (None Fit) --</option>
                {notebooks.map((n) => (
                  <option key={n.id} value={n.id} className="bg-[#0e0e1a]">
                    {n.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Chapter</label>
              <select
                value={formChapterId}
                disabled={!formNotebookId}
                onChange={(e) => setFormChapterId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 disabled:opacity-40"
              >
                <option value="" className="bg-[#0e0e1a]">-- Unassigned --</option>
                {availableChapters.map((c: any) => (
                  <option key={c.id} value={c.id} className="bg-[#0e0e1a]">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Skills Demonstrated</label>
              <textarea
                value={formSkills}
                onChange={(e) => setFormSkills(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Concepts Discussed</label>
              <textarea
                value={formConcepts}
                onChange={(e) => setFormConcepts(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold ml-1">Question Log</label>
              <textarea
                value={formQuestionLog}
                onChange={(e) => setFormQuestionLog(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-xs focus:outline-none"
              />
            </div>

            {/* OCR raw text blocks */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Extracted Text</h3>
              {rawTexts.map((text, idx) => (
                <div key={idx} className="bg-white/[0.01] border border-white/5 rounded-xl overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setExpandedRawTextIndex(expandedRawTextIndex === idx ? null : idx)}
                    className="w-full px-4 py-2.5 text-left font-semibold flex justify-between items-center"
                  >
                    <span>Page {idx + 1} OCR Raw</span>
                    <span>{expandedRawTextIndex === idx ? '▲' : '▼'}</span>
                  </button>
                  {expandedRawTextIndex === idx && (
                    <textarea
                      value={text}
                      onChange={(e) => {
                        const newTexts = [...rawTexts];
                        newTexts[idx] = e.target.value;
                        setRawTexts(newTexts);
                      }}
                      rows={4}
                      className="w-full px-4 py-3 bg-[#0d0d19] border-t border-white/5 text-xs text-gray-300 focus:outline-none leading-relaxed"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/5 mt-4">
            <button
              onClick={() => {
                setStep('capture');
                setAiData(null);
              }}
              className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-semibold"
            >
              Back to Camera
            </button>
            <button
              onClick={handleSaveEntry}
              disabled={isSaving}
              className="flex-2 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all flex justify-center items-center"
            >
              {isSaving ? 'Filing Entry...' : 'Save & File'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
