'use client';

import { useState, useEffect, useCallback } from 'react';
import { type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/browser';

interface AuthState {
  user: User | null;
  loading: boolean;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
  });

  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setState({ user, loading: false });
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION may carry expired JWT from cookie; getUser() is authoritative.
      if (event === 'INITIAL_SESSION') {
        return;
      }
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return { error };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPassword = useCallback(async (email: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin ? `${origin}/auth/update-password` : undefined,
    });
    return { error };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    user: state.user,
    loading: state.loading,
    signIn,
    signUp,
    signOut,
    verifyOtp,
    resetPassword,
  };
};
