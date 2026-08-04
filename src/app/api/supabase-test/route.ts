import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Try to perform a query. Even if the table doesn't exist yet, we can check the error code or response structure.
    const { data, error } = await supabase.from('notebooks').select('count', { count: 'exact', head: true });

    if (error && error.code !== 'PGRST116' && error.message.includes('FetchError')) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: 'Could not connect to Supabase backend or network failed.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase client initialized successfully.',
      data,
      error: error ? { code: error.code, message: error.message } : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
