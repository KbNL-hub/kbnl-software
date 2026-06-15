import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'kbnl_pwa_prompted';
const FIRST_LOGIN_KEY = 'kbnl_first_login';

export function usePWAInstall() {
  const [hasBeenPrompted, setHasBeenPrompted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    // Get session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    const initPWAState = async () => {
      try {
        const localPrompted = localStorage.getItem(STORAGE_KEY);
        
        if (localPrompted === 'true') {
          setHasBeenPrompted(true);
          setIsLoading(false);
          return;
        }

        if (!session?.user?.id) {
          setIsLoading(false);
          return;
        }

        const localFirstLogin = localStorage.getItem(FIRST_LOGIN_KEY);
        if (!localFirstLogin) {
          setHasBeenPrompted(false);
          localStorage.setItem(FIRST_LOGIN_KEY, session.user.id);
        } else {
          setHasBeenPrompted(true);
        }
      } catch (error) {
        console.error('Error initializing PWA state:', error);
        setHasBeenPrompted(true);
      } finally {
        setIsLoading(false);
      }
    };

    initPWAState();
  }, [session?.user?.id]);

  const markAsPrompted = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasBeenPrompted(true);
  };

  const resetPrompt = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FIRST_LOGIN_KEY);
    setHasBeenPrompted(false);
  };

  return {
    hasBeenPrompted,
    markAsPrompted,
    resetPrompt,
    isLoading,
  };
}