import { NextResponse } from 'next/server';
import { analyzeNoteImages } from '@/utils/ai';

export async function POST(request: Request) {
  try {
    const { imagePaths } = await request.json();
    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      return NextResponse.json({ success: false, error: 'No image paths provided' }, { status: 400 });
    }

    const result = await analyzeNoteImages(imagePaths);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Processing failed' }, { status: 500 });
  }
}
