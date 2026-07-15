'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js'
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import ErrorBoundary from '@/components/ErrorBoundary';
import { supabase } from '@/lib/supabase';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) {
        setSession(data.session)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session)
        if (event === 'SIGNED_OUT') {
          router.push('/login')
        }
      }
    )

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [router]);

  useEffect(() => {
    if (!loading && !session) {
      router.push('/login');
    }
  }, [session, loading, router]);

  if (loading) 
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column' }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #f0f0f0", borderTop: "3px solid #0070f3", animation: "spin 1s linear infinite" }} />
        <p>Loading...</p>
      </div>
    );

  if (!session) return null;

  return (
    <>
      <PWAInstallPrompt />
      <ErrorBoundary label="Dashboard">
        {children}
      </ErrorBoundary>
    </>
  );
}