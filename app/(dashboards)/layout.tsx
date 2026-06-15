'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { supabase } from '@/lib/supabase';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

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
      {children}
    </>
  );
}