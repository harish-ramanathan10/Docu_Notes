'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Account created successfully! Logging you in...' });
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1500);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Welcome back! Redirecting...' });
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Authentication failed. Please try again.' });
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp((prev) => !prev);
    setMessage(null);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F9F8F6] font-[Inter,sans-serif] px-4">
      <div className="w-full max-w-md p-8 bg-white border border-[#1C1C1C]/10 rounded-md shadow-sm">
        {/* Logo/Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            role="img"
            aria-label="DocuNotes logo"
            className="w-8 h-8 bg-[#1C1C1C] shrink-0"
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
          <h1 className="text-3xl font-bold tracking-tight text-[#1C1C1C] font-[\'Source_Serif_4\',serif]">
            DocuNotes
          </h1>
        </div>

        {/* Notifications */}
        {message && (
          <div
            className={`p-3.5 mb-5 rounded-md text-sm border ${
              message.type === 'success'
                ? 'bg-[#F9F8F6] border-[#1C1C1C]/15 text-[#1C1C1C]'
                : 'bg-[#F9F8F6] border-[#797676]/40 text-[#797676]'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#797676] uppercase tracking-wider mb-1.5 ml-0.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-4 py-3 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] placeholder-[#8E8E93] focus:outline-none focus:border-[#1C1C1C] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#797676] uppercase tracking-wider mb-1.5 ml-0.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-md bg-[#F9F8F6] border border-[#8E8E93]/30 text-[#1C1C1C] placeholder-[#8E8E93] focus:outline-none focus:border-[#1C1C1C] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-md bg-[#1C1C1C] text-white font-semibold hover:opacity-90 active:opacity-100 disabled:opacity-50 transition-opacity cursor-pointer flex justify-center items-center"
          >
            {loading ? (
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : isSignUp ? (
              'Sign Up'
            ) : (
              'Log In'
            )}
          </button>
        </form>

        {/* Toggle link at the bottom */}
        <div className="text-center mt-6">
          <span className="text-sm text-[#797676]">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </span>{' '}
          <button
            type="button"
            onClick={toggleMode}
            className="text-sm font-semibold text-[#1C1C1C] underline underline-offset-2 hover:opacity-70 transition-opacity cursor-pointer"
          >
            {isSignUp ? 'Log In' : 'Create Account'}
          </button>
        </div>
      </div>
    </main>
  );
}