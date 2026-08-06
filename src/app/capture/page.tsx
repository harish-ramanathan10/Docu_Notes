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

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
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

const CameraIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
    />
    <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const ImagesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <rect x="3" y="3" width="14" height="14" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h11a2 2 0 002-2V8" />
  </svg>
);

const Spinner = (props: React.SVGProps<SVGSVGElement>) => (
  <svg className="animate-spin" viewBox="0 0 24 24" fill="none" {...props}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

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

  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showStagedDrawer, setShowStagedDrawer] = useState(false);

  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [existingEntries, setExistingEntries] = useState<any[]>([]);
  const [targetMode, setTargetMode] = useState<'new' | 'append'>('new');
  const [targetEntryId, setTargetEntryId] = useState<string>('');

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



  const rotateLastImage = async () => {
    if (stagedImages.length === 0) return;
    const lastIndex = stagedImages.length - 1;
    const target = stagedImages[lastIndex];

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const newFile = new File([blob], target.file.name, { type: 'image/jpeg' });
        setStagedImages(prev => prev.map((item, idx) => {
          if (idx === lastIndex) {
            URL.revokeObjectURL(item.previewUrl);
            return {
              ...item,
              file: newFile,
              previewUrl: URL.createObjectURL(newFile),
              compressedSizeKb: Math.round(newFile.size / 1024),
            };
          }
          return item;
        }));
      }, 'image/jpeg', 0.85);
    };
    img.src = target.previewUrl;
  };

  const cropLastImage = async () => {
    if (stagedImages.length === 0) return;
    const lastIndex = stagedImages.length - 1;
    const target = stagedImages[lastIndex];

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const targetAspect = 8.5 / 11;
      const currentAspect = img.width / img.height;

      let sourceWidth = img.width;
      let sourceHeight = img.height;
      let xOffset = 0;
      let yOffset = 0;

      if (currentAspect > targetAspect) {
        sourceWidth = img.height * targetAspect;
        xOffset = (img.width - sourceWidth) / 2;
      } else {
        sourceHeight = img.width / targetAspect;
        yOffset = (img.height - sourceHeight) / 2;
      }

      canvas.width = 850;
      canvas.height = 1100;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, xOffset, yOffset, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const newFile = new File([blob], target.file.name, { type: 'image/jpeg' });
        setStagedImages(prev => prev.map((item, idx) => {
          if (idx === lastIndex) {
            URL.revokeObjectURL(item.previewUrl);
            return {
              ...item,
              file: newFile,
              previewUrl: URL.createObjectURL(newFile),
              compressedSizeKb: Math.round(newFile.size / 1024),
            };
          }
          return item;
        }));
      }, 'image/jpeg', 0.85);
    };
    img.src = target.previewUrl;
  };

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

    // Reset the input so selecting/capturing the same or another photo
    // again always fires onChange (browsers won't fire change on an
    // identical file list otherwise).
    e.target.value = '';
  };

  const removeStagedImage = (id: string) => {
    setStagedImages((prev) => {
      const imageToRemove = prev.find((img) => img.id === id);
      if (imageToRemove) URL.revokeObjectURL(imageToRemove.previewUrl);
      const updated = prev.filter((img) => img.id !== id);
      if (updated.length === 0) setShowStagedDrawer(false);
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

  const processCapturedPages = async () => {
    if (stagedImages.length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setShowStagedDrawer(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthorized');

      const uploadedPaths: string[] = [];

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

      const res = await fetch('/api/process-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePaths: uploadedPaths }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to analyze notes');

      const result: AIResult = json.data;

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

      setStagedImages([]);
      setStep('capture');
      setAiData(null);
      setErrorMsg(null);
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
    <main className="min-h-screen h-screen bg-[#F9F8F6] font-[Inter,sans-serif] flex flex-col">
      {/* ============ STEP 1: CAPTURE ============ */}
      {step === 'capture' && (
        <div className="flex-1 flex flex-col h-full">
          {/* Header */}
          <header className="px-5 py-4 flex items-center justify-between bg-white border-b border-[#1C1C1C]/10 shrink-0">
            <div className="flex items-center gap-2">
              <div
                role="img"
                aria-label="DocuNotes logo"
                className="w-6 h-6 bg-[#1C1C1C] shrink-0"
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
              <span className="text-sm font-bold text-[#1C1C1C] font-['Source_Serif_4',serif]">
                DocuNotes
              </span>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="w-9 h-9 rounded-md border border-[#1C1C1C]/10 flex items-center justify-center text-[#797676] hover:text-[#1C1C1C] hover:bg-[#F9F8F6] transition-all duration-200 ease-out cursor-pointer"
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          </header>

          {/* Viewfinder */}
          <div className="flex-1 flex flex-col justify-center items-center px-2 py-2 min-h-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full max-w-md aspect-[8.5/11] max-h-[60vh] rounded-xl border-2 border-dashed border-[#8E8E93]/50 hover:border-[#1C1C1C] bg-white flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all duration-300 ease-out shadow-md"
            >

              {stagedImages.length > 0 ? (
                <img
                  src={stagedImages[stagedImages.length - 1].previewUrl}
                  alt="Last captured page"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center px-8">
                  <div className="w-14 h-14 rounded-md bg-[#F9F8F6] border border-[#1C1C1C]/10 flex items-center justify-center mx-auto mb-4">
                    <CameraIcon className="w-6 h-6 text-[#1C1C1C]" />
                  </div>
                  <p className="text-sm font-bold text-[#1C1C1C]">Tap to scan a page</p>
                  <p className="text-xs text-[#8E8E93] mt-1">Letter-size documents work best</p>
                </div>
              )}

              {errorMsg && (
                <div className="absolute bottom-3 left-3 right-3 p-2.5 bg-[#B3261E] rounded-md text-[11px] text-center font-semibold text-white">
                  {errorMsg}
                </div>
              )}

              {isProcessing && (
                <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center gap-3">
                  <Spinner className="w-8 h-8 text-[#1C1C1C]" />
                  <span className="text-xs font-semibold text-[#1C1C1C]">Reading handwriting…</span>
                </div>
              )}
            </div>

            {/* Viewfinder Toolbar Controls */}
            {stagedImages.length > 0 && (
              <div className="flex items-center gap-2 mt-4 text-[11px] font-semibold">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    rotateLastImage();
                  }}
                  className="px-3 py-1.5 rounded-md bg-white border border-[#1C1C1C]/15 hover:bg-[#F9F8F6] text-[#1C1C1C] cursor-pointer"
                >
                  Rotate 90°
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cropLastImage();
                  }}
                  className="px-3 py-1.5 rounded-md bg-white border border-[#1C1C1C]/15 hover:bg-[#F9F8F6] text-[#1C1C1C] cursor-pointer"
                >
                  Crop to Letter
                </button>

              </div>
            )}
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

          {/* Bottom control panel */}
          <div className="bg-white border-t border-[#1C1C1C]/10 px-5 pt-4 pb-6 space-y-4 shrink-0">
            {/* Mode toggle */}
            <div className="flex justify-center items-center gap-6 text-sm">
              <button
                type="button"
                onClick={() => setTargetMode('new')}
                className={`pb-1 border-b-2 font-semibold transition-all duration-200 ease-out cursor-pointer ${
                  targetMode === 'new'
                    ? 'border-[#1C1C1C] text-[#1C1C1C]'
                    : 'border-transparent text-[#8E8E93] hover:text-[#1C1C1C]'
                }`}
              >
                New Note
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('append')}
                className={`pb-1 border-b-2 font-semibold transition-all duration-200 ease-out cursor-pointer ${
                  targetMode === 'append'
                    ? 'border-[#1C1C1C] text-[#1C1C1C]'
                    : 'border-transparent text-[#8E8E93] hover:text-[#1C1C1C]'
                }`}
              >
                Append
              </button>
            </div>

            {targetMode === 'append' && (
              <select
                value={targetEntryId}
                onChange={(e) => setTargetEntryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-xs focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              >
                <option value="">-- Append to which entry? --</option>
                {existingEntries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            )}

            {/* Staged pages chip */}
            <button
              onClick={() => stagedImages.length > 0 && setShowStagedDrawer(true)}
              disabled={stagedImages.length === 0}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#1C1C1C]/10 text-left disabled:opacity-60 hover:bg-white transition-all duration-200 ease-out cursor-pointer disabled:cursor-default"
            >
              <div className="w-9 h-9 rounded-md bg-white border border-[#1C1C1C]/10 flex items-center justify-center shrink-0 overflow-hidden">
                {stagedImages.length > 0 ? (
                  <img
                    src={stagedImages[stagedImages.length - 1].previewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagesIcon className="w-4 h-4 text-[#8E8E93]" />
                )}
              </div>
              <span className="text-xs font-semibold text-[#1C1C1C] flex-1">
                {stagedImages.length === 0
                  ? 'No pages captured yet'
                  : `${stagedImages.length} page${stagedImages.length > 1 ? 's' : ''} staged — review order`}
              </span>
            </button>

            {/* Primary actions */}
            <div className="flex gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex-1 py-3.5 rounded-md border border-[#1C1C1C]/15 text-[#1C1C1C] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#F9F8F6] disabled:opacity-30 transition-all duration-200 ease-out cursor-pointer disabled:cursor-default"
              >
                <CameraIcon className="w-4 h-4" />
                Add Page
              </button>
              <button
                onClick={processCapturedPages}
                disabled={stagedImages.length === 0 || isProcessing}
                className="flex-[2] py-3.5 rounded-md bg-[#1C1C1C] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 hover:opacity-90 transition-all duration-200 ease-out cursor-pointer disabled:cursor-default"
              >
                {isProcessing ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    Processing…
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    Process {stagedImages.length > 0 ? `${stagedImages.length} Page${stagedImages.length > 1 ? 's' : ''}` : 'Pages'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Staged review drawer */}
          {showStagedDrawer && (
            <div className="fixed inset-0 z-30 bg-[#1C1C1C]/40 backdrop-blur-sm flex flex-col justify-end">
              <div className="bg-white border-t border-[#1C1C1C]/10 rounded-t-md p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[#1C1C1C] font-['Source_Serif_4',serif]">
                    Staged Pages ({stagedImages.length})
                  </h3>
                  <button
                    onClick={() => setShowStagedDrawer(false)}
                    className="px-3 py-1.5 rounded-md bg-[#1C1C1C] text-white text-xs font-semibold hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                  >
                    Done
                  </button>
                </div>

                <div className="space-y-2.5">
                  {stagedImages.map((img, index) => (
                    <div
                      key={img.id}
                      className="flex items-center gap-3 p-3 bg-[#F9F8F6] border border-[#1C1C1C]/10 rounded-md"
                    >
                      <div className="relative w-12 h-16 rounded-md overflow-hidden border border-[#1C1C1C]/10 shrink-0">
                        <img
                          src={img.previewUrl}
                          alt={`Page preview ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 left-1 bg-[#1C1C1C] text-white text-[9px] font-bold px-1 rounded-sm">
                          {index + 1}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#1C1C1C]">Page {index + 1}</p>
                        <p className="text-[10px] text-[#8E8E93]">{img.compressedSizeKb}KB</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => moveImage(index, 'up')}
                          disabled={index === 0}
                          aria-label="Move earlier"
                          className="w-8 h-8 rounded-md border border-[#1C1C1C]/10 bg-white flex items-center justify-center text-[#797676] hover:text-[#1C1C1C] disabled:opacity-25 transition-all duration-200 ease-out cursor-pointer"
                        >
                          <ChevronUpIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveImage(index, 'down')}
                          disabled={index === stagedImages.length - 1}
                          aria-label="Move later"
                          className="w-8 h-8 rounded-md border border-[#1C1C1C]/10 bg-white flex items-center justify-center text-[#797676] hover:text-[#1C1C1C] disabled:opacity-25 transition-all duration-200 ease-out cursor-pointer"
                        >
                          <ChevronDownIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeStagedImage(img.id)}
                          aria-label="Remove page"
                          className="w-8 h-8 rounded-md bg-[#B3261E] flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ STEP 2: AI REVIEW ============ */}
      {step === 'review' && aiData && (
        <div className="flex-1 flex flex-col h-full">
          <header className="px-5 py-4 bg-white border-b border-[#1C1C1C]/10 shrink-0">
            <h2 className="text-base font-bold text-[#1C1C1C] font-['Source_Serif_4',serif]">
              Review &amp; Tag
            </h2>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Confirm the details before saving.</p>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-md bg-[#F9F8F6] border border-[#B3261E]/30 text-[#B3261E] text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Title
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Type
              </label>
              <div className="flex gap-2 text-xs">
                {(['Practice', 'Course Notes', 'Other'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormType(type)}
                    className={`flex-1 py-2.5 rounded-md border font-semibold transition-all duration-200 ease-out cursor-pointer ${
                      formType === type
                        ? 'bg-[#1C1C1C] border-[#1C1C1C] text-white'
                        : 'bg-white border-[#1C1C1C]/10 text-[#797676] hover:border-[#1C1C1C]/30'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Notebook
              </label>
              <select
                value={formNotebookId}
                onChange={(e) => {
                  setFormNotebookId(e.target.value);
                  setFormChapterId('');
                }}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              >
                <option value="">-- Unassigned (none fit) --</option>
                {notebooks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Chapter
              </label>
              <select
                value={formChapterId}
                disabled={!formNotebookId}
                onChange={(e) => setFormChapterId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] disabled:opacity-40 transition-all duration-200 ease-out"
              >
                <option value="">-- Unassigned --</option>
                {availableChapters.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Description
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Skills Demonstrated
              </label>
              <textarea
                value={formSkills}
                onChange={(e) => setFormSkills(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Concepts Discussed
              </label>
              <textarea
                value={formConcepts}
                onChange={(e) => setFormConcepts(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8E8E93] uppercase tracking-wider mb-1.5 font-bold ml-0.5">
                Question Log
              </label>
              <textarea
                value={formQuestionLog}
                onChange={(e) => setFormQuestionLog(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#1C1C1C] transition-all duration-200 ease-out"
              />
            </div>

            {/* OCR raw text blocks */}
            <div className="space-y-2 pt-3 border-t border-[#1C1C1C]/10">
              <h3 className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider ml-0.5">
                Extracted Text
              </h3>
              {rawTexts.map((text, idx) => (
                <div key={idx} className="bg-white border border-[#1C1C1C]/10 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedRawTextIndex(expandedRawTextIndex === idx ? null : idx)}
                    className="w-full px-4 py-3 text-left text-xs font-semibold text-[#1C1C1C] flex justify-between items-center cursor-pointer"
                  >
                    <span>Page {idx + 1} OCR Raw</span>
                    {expandedRawTextIndex === idx ? (
                      <ChevronUpIcon className="w-3.5 h-3.5 text-[#797676]" />
                    ) : (
                      <ChevronDownIcon className="w-3.5 h-3.5 text-[#797676]" />
                    )}
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
                      className="w-full px-4 py-3 bg-[#F9F8F6] border-t border-[#1C1C1C]/10 text-xs text-[#1C1C1C] focus:outline-none leading-relaxed"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom actions */}
          <div className="flex gap-3 px-5 py-4 border-t border-[#1C1C1C]/10 bg-white shrink-0">
            <button
              onClick={() => {
                setStep('capture');
                setAiData(null);
              }}
              className="flex-1 py-3 rounded-md border border-[#1C1C1C]/15 text-[#1C1C1C] text-sm font-semibold hover:bg-[#F9F8F6] transition-all duration-200 ease-out cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={handleSaveEntry}
              disabled={isSaving}
              className="flex-[2] py-3 rounded-md bg-[#1C1C1C] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all duration-200 ease-out cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Spinner className="w-4 h-4" />
                  Filing Entry…
                </>
              ) : (
                'Save & File'
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}