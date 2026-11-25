'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeToken } from '@/lib/auth';
import { Suspense } from 'react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      storeToken(token);
      router.replace('/dashboard');
    } else {
      router.replace('/login?error=no_token');
    }
  }, [router, searchParams]);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-dark-900 gap-4">
      <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Completing sign in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-900" />}>
      <CallbackContent />
    </Suspense>
  );
}
