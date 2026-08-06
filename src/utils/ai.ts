import { createClient } from '@/utils/supabase/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';

export interface AIAnalysisResult {
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

export async function analyzeNoteImages(imagePaths: string[]): Promise<AIAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not defined.');

  const supabase = await createClient();

  // 1. Fetch user's active notebooks and chapters to present to Gemini
  const { data: notebooks, error: dbError } = await supabase
    .from('notebooks')
    .select('id, name, chapters(id, name)')
    .eq('status', 'active');

  if (dbError) throw dbError;

  // 2. Download files from Supabase Storage and convert to base64 parts for Gemini
  const mediaParts: { inlineData: { data: string; mimeType: string } }[] = [];
  for (const path of imagePaths) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('page-images')
      .download(path);

    if (downloadError) {
      throw new Error(`Failed to download image ${path}: ${downloadError.message}`);
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    mediaParts.push({
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: fileData.type || 'image/jpeg',
      },
    });
  }

  // 3. Prepare schema/prompt context for Gemini
  const notebookContext = (notebooks || []).map((n) => ({
    id: n.id,
    name: n.name,
    chapters: (n.chapters || []).map((c: any) => ({ id: c.id, name: c.name })),
  }));

  const prompt = `
You are an advanced handwriting OCR and study note analysis assistant.
Analyze the attached note pages (images) in chronological order. Perform the following operations:
1. Extract the raw text from each page.
2. Determine if the entry type is "Practice", "Course Notes", or "Other".
3. Auto-assign the entry to the single best-fitting existing notebook and chapter from the provided list. If nothing fits well or if the list is empty, return null for both notebook_id and chapter_id. Do NOT invent new notebooks or chapters.
4. Auto-generate a title and a brief description (max 2-3 sentences).
5. Always populate and summarize:
   - skills_and_concepts: Skills demonstrated (e.g. methods practiced).
   - concepts_discussed: Main theoretical concepts.
   - question_log: Plain-text overview of the kinds of questions worked through.

Available Notebooks and Chapters:
${JSON.stringify(notebookContext, null, 2)}
`;

  // 4. Set up Gemini JSON response schema
  const geminiSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      raw_text_per_page: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Raw text extracted from each page/image in order",
      },
      entry_type: {
        type: Type.STRING,
        enum: ["Practice", "Course Notes", "Other"],
        description: "Inferred class of the document set",
      },
      notebook_id: {
        type: Type.STRING,
        nullable: true,
        description: "ID of the best matching notebook, or null if no fit",
      },
      chapter_id: {
        type: Type.STRING,
        nullable: true,
        description: "ID of the best matching chapter within the selected notebook, or null if no fit",
      },
      title: {
        type: Type.STRING,
        description: "Short descriptive title for this entry",
      },
      description: {
        type: Type.STRING,
        description: "Brief summary, strictly 2-3 sentences max",
      },
      skills_and_concepts: {
        type: Type.STRING,
        description: "General description of skills demonstrated",
      },
      concepts_discussed: {
        type: Type.STRING,
        description: "General description of concepts covered",
      },
      question_log: {
        type: Type.STRING,
        description: "Plain text summary of questions worked through",
      },
    },
    required: [
      "raw_text_per_page",
      "entry_type",
      "title",
      "description",
      "skills_and_concepts",
      "concepts_discussed",
      "question_log",
    ],
  };

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: [prompt, ...mediaParts],
    config: {
      responseMimeType: 'application/json',
      responseSchema: geminiSchema,
    },
  });

  const resultText = response.text;
  if (!resultText) throw new Error('Gemini returned an empty response');

  return JSON.parse(resultText) as AIAnalysisResult;
}
