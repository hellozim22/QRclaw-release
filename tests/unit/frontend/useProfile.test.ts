/**
 * Unit tests for useProfile hook.
 * Tests profile derivation from useAuth user data.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ─── Mock useAuth ──────────────────────────────────────────────────

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

import { useProfile } from '@/hooks/useProfile';

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should return loading true when auth is loading', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: true });
      const { result } = renderHook(() => useProfile());

      expect(result.current.loading).toBe(true);
      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('unauthenticated state', () => {
    it('should return error when user is null', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      const { result } = renderHook(() => useProfile());

      expect(result.current.loading).toBe(false);
      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBe('Not authenticated');
    });
  });

  describe('profile derivation', () => {
    it('should derive profile from user with full_name metadata', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'john@example.com',
          user_metadata: { full_name: 'John Doe' },
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile).toEqual({
        id: 'user-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        initials: 'JD',
        avatarUrl: null,
      });
    });

    it('should surface avatar url from metadata', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-avatar',
          email: 'avatar@example.com',
          user_metadata: {
            full_name: 'Avatar User',
            avatar_url: 'data:image/jpeg;base64,abc123',
          },
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.avatarUrl).toBe('data:image/jpeg;base64,abc123');
    });

    it('should use name metadata when full_name is absent', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-456',
          email: 'jane@example.com',
          user_metadata: { name: 'Jane Smith' },
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.displayName).toBe('Jane Smith');
      expect(result.current.profile?.initials).toBe('JS');
    });

    it('should derive display name from email when no metadata', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-789',
          email: 'john.doe@example.com',
          user_metadata: {},
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.displayName).toBe('John Doe');
    });

    it('should handle email with underscores', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-abc',
          email: 'john_doe@example.com',
          user_metadata: {},
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.displayName).toBe('John Doe');
    });

    it('should handle email with hyphens', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-def',
          email: 'john-doe@example.com',
          user_metadata: {},
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.displayName).toBe('John Doe');
    });

    it('should handle single word email prefix', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-ghi',
          email: 'admin@example.com',
          user_metadata: {},
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.displayName).toBe('Admin');
      expect(result.current.profile?.initials).toBe('AD');
    });

    it('should handle empty email gracefully', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-noemail',
          email: undefined,
          user_metadata: {},
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile).toBeDefined();
      expect(result.current.profile?.email).toBe('');
    });
  });

  describe('getInitials', () => {
    it('should return two-letter initials for multi-word name', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'u1',
          email: 'x@y.com',
          user_metadata: { full_name: 'Alice Bob Charlie' },
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      // First + last initials
      expect(result.current.profile?.initials).toBe('AC');
    });

    it('should return first two chars for single word name', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'u2',
          email: 'x@y.com',
          user_metadata: { full_name: 'Admin' },
        },
        loading: false,
      });
      const { result } = renderHook(() => useProfile());

      expect(result.current.profile?.initials).toBe('AD');
    });
  });
});
