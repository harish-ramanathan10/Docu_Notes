import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'GEMINI_API_KEY environment variable is not defined.',
      },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Using gemini-2.0-flash-lite as the standard Flash-Lite model
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: 'Hello! Please confirm you are working and print a 5-word welcome message.',
    });

    return NextResponse.json({
      success: true,
      model: 'gemini-2.0-flash-lite',
      text: response.text,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Unknown error occurred contacting Gemini API',
      },
      { status: 500 }
    );
  }
}
