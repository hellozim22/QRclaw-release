/**
 * Unit tests for useAuth hook.
 * Tests auth state management, signIn, signUp, signOut, and verifyOtp.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mock Supabase Client ──────────────────────────────────────────

const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
      verifyOtp: mockVerifyOtp,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

import { useAuth } from '@/hooks/useAuth';

describe('useAuth', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  describe('initial state', () => {
    it('should start with loading true and user null', () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
    });

    it('should set loading false after getUser resolves', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.user).toBeNull();
    });

    it('should set user when getUser returns a user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser } });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.user).toEqual(mockUser);
    });
  });

  describe('auth state change listener', () => {
    it('should subscribe to auth state changes on mount', () => {
      renderHook(() => useAuth());
      expect(mockOnAuthStateChange).toHaveBeenCalledOnce();
    });

    it('should unsubscribe on unmount', () => {
      const { unmount } = renderHook(() => useAuth());
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });

    it('should update user when auth state changes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      let authCallback: (event: string, session: unknown) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        authCallback('SIGNED_IN', { user: mockUser });
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.loading).toBe(false);
    });

    it('should set user to null when session is null', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser } });

      let authCallback: (event: string, session: unknown) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      act(() => {
        authCallback('SIGNED_OUT', null);
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('signIn', () => {
    it('should call signInWithPassword with email and password', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.signIn('test@example.com', 'password123');

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(error).toBeNull();
    });

    it('should return error when signIn fails', async () => {
      const authError = { message: 'Invalid credentials' };
      mockSignInWithPassword.mockResolvedValue({ error: authError });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.signIn('test@example.com', 'wrong');
      expect(error).toEqual(authError);
    });
  });

  describe('signUp', () => {
    it('should call signUp with email, password, and redirect URL', async () => {
      mockSignUp.mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.signUp('new@example.com', 'password123');

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: expect.stringContaining('/auth/callback'),
        },
      });
      expect(error).toBeNull();
    });

    it('should return error when signUp fails', async () => {
      const authError = { message: 'Email already registered' };
      mockSignUp.mockResolvedValue({ error: authError });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.signUp('existing@example.com', 'password');
      expect(error).toEqual(authError);
    });
  });

  describe('signOut', () => {
    it('should call supabase signOut', async () => {
      mockSignOut.mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.signOut();
      expect(mockSignOut).toHaveBeenCalledOnce();
      expect(error).toBeNull();
    });
  });

  describe('verifyOtp', () => {
    it('should call verifyOtp with email, token, and type', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.verifyOtp('test@example.com', '123456');

      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        token: '123456',
        type: 'email',
      });
      expect(error).toBeNull();
    });

    it('should return error on invalid OTP', async () => {
      const authError = { message: 'Invalid OTP' };
      mockVerifyOtp.mockResolvedValue({ error: authError });
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const { error } = await result.current.verifyOtp('test@example.com', 'wrong');
      expect(error).toEqual(authError);
    });
  });
});
