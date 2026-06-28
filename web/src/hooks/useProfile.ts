'use client';

import { useAuth } from './useAuth';

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
}

interface UseProfileReturn {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const getDisplayName = (email: string, metadata?: Record<string, unknown>): string => {
  if (metadata?.full_name && typeof metadata.full_name === 'string') {
    return metadata.full_name;
  }
  if (metadata?.name && typeof metadata.name === 'string') {
    return metadata.name;
  }
  // Derive name from email prefix
  const prefix = email.split('@')[0];
  return prefix.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const useProfile = (): UseProfileReturn => {
  const { user, loading } = useAuth();

  if (loading) {
    return { profile: null, loading: true, error: null };
  }

  if (!user) {
    return { profile: null, loading: false, error: 'Not authenticated' };
  }

  const email = user.email ?? '';
  const displayName = getDisplayName(email, user.user_metadata);
  const initials = getInitials(displayName);
  const avatarUrl =
    typeof user.user_metadata?.avatar_url === 'string' &&
    user.user_metadata.avatar_url.trim().length > 0
      ? user.user_metadata.avatar_url.trim()
      : null;

  const profile: Profile = {
    id: user.id,
    email,
    displayName,
    initials,
    avatarUrl,
  };

  return { profile, loading: false, error: null };
};
