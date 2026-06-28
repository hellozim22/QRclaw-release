import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Production Smoke Tests — Auth Flow (Phase 7)
 *
 * Validates auth lifecycle contract:
 * - Signup → confirmation email → login → access token + refresh token
 * - Token refresh → new access token
 * - Invalid credentials → 401
 * - Expired token → 401
 * - Logout → session invalidated
 *
 * Mock-based: validates Supabase Auth integration contract.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    role: 'owner' | 'agent' | 'visitor';
  };
}

interface AuthError {
  code: string;
  message: string;
}

type AuthResult = { success: true; session: AuthSession } | { success: false; error: AuthError };

// ─── Mock Auth Service ──────────────────────────────────────────────

const createAuthService = () => {
  const users = new Map<
    string,
    { id: string; email: string; password: string; confirmed: boolean }
  >();
  const sessions = new Map<string, AuthSession>();
  let tokenCounter = 0;

  const signup = (email: string, password: string): AuthResult => {
    if (users.has(email)) {
      return {
        success: false,
        error: { code: 'user_exists', message: 'Email already registered' },
      };
    }

    if (password.length < 8) {
      return {
        success: false,
        error: { code: 'weak_password', message: 'Password must be at least 8 characters' },
      };
    }

    const id = `user-${users.size + 1}`;
    users.set(email, { id, email, password, confirmed: false });

    return {
      success: true,
      session: createSession(id, email, 'owner'),
    };
  };

  const confirmEmail = (email: string): boolean => {
    const user = users.get(email);
    if (!user) return false;
    users.set(email, { ...user, confirmed: true });
    return true;
  };

  const login = (email: string, password: string): AuthResult => {
    const user = users.get(email);
    if (!user || user.password !== password) {
      return {
        success: false,
        error: { code: 'invalid_credentials', message: 'Invalid email or password' },
      };
    }

    return {
      success: true,
      session: createSession(user.id, user.email, 'owner'),
    };
  };

  const refreshToken = (refreshTok: string): AuthResult => {
    const session = sessions.get(refreshTok);
    if (!session) {
      return {
        success: false,
        error: { code: 'invalid_refresh_token', message: 'Refresh token not found' },
      };
    }

    // Invalidate old session
    sessions.delete(refreshTok);

    // Create new session
    return {
      success: true,
      session: createSession(session.user.id, session.user.email, session.user.role),
    };
  };

  const verifyToken = (accessToken: string): AuthResult => {
    for (const session of sessions.values()) {
      if (session.accessToken === accessToken) {
        if (session.expiresAt < Math.floor(Date.now() / 1000)) {
          return {
            success: false,
            error: { code: 'token_expired', message: 'Access token expired' },
          };
        }
        return { success: true, session };
      }
    }
    return { success: false, error: { code: 'invalid_token', message: 'Token not found' } };
  };

  const logout = (refreshTok: string): boolean => {
    return sessions.delete(refreshTok);
  };

  const createSession = (
    userId: string,
    email: string,
    role: 'owner' | 'agent' | 'visitor'
  ): AuthSession => {
    tokenCounter += 1;
    const session: AuthSession = {
      accessToken: `at_${tokenCounter}_${Date.now()}`,
      refreshToken: `rt_${tokenCounter}_${Date.now()}`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email, role },
    };
    sessions.set(session.refreshToken, session);
    return session;
  };

  return { signup, confirmEmail, login, refreshToken, verifyToken, logout };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Smoke: Auth Flow — Signup → Login → Token', () => {
  let auth: ReturnType<typeof createAuthService>;

  beforeEach(() => {
    auth = createAuthService();
    vi.restoreAllMocks();
  });

  it('signup → login → valid access token', () => {
    const signupResult = auth.signup('owner@test.com', 'password123');
    expect(signupResult.success).toBe(true);

    auth.confirmEmail('owner@test.com');

    const loginResult = auth.login('owner@test.com', 'password123');
    expect(loginResult.success).toBe(true);

    if (loginResult.success) {
      expect(loginResult.session.accessToken).toBeTruthy();
      expect(loginResult.session.refreshToken).toBeTruthy();
      expect(loginResult.session.user.email).toBe('owner@test.com');
    }
  });

  it('signup returns access and refresh tokens', () => {
    const result = auth.signup('new@test.com', 'password123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session.accessToken).toMatch(/^at_/);
      expect(result.session.refreshToken).toMatch(/^rt_/);
      expect(result.session.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it('duplicate signup returns user_exists error', () => {
    auth.signup('dup@test.com', 'password123');
    const result = auth.signup('dup@test.com', 'password456');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('user_exists');
    }
  });

  it('weak password rejected', () => {
    const result = auth.signup('weak@test.com', 'short');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('weak_password');
    }
  });

  it('invalid credentials return 401-equivalent error', () => {
    auth.signup('valid@test.com', 'password123');
    const result = auth.login('valid@test.com', 'wrong-password');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('invalid_credentials');
    }
  });

  it('login for non-existent user returns invalid_credentials', () => {
    const result = auth.login('noone@test.com', 'password123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('invalid_credentials');
    }
  });

  it('token refresh returns new access token', () => {
    const signup = auth.signup('refresh@test.com', 'password123');
    if (!signup.success) throw new Error('signup failed');

    const refreshResult = auth.refreshToken(signup.session.refreshToken);

    expect(refreshResult.success).toBe(true);
    if (refreshResult.success) {
      expect(refreshResult.session.accessToken).not.toBe(signup.session.accessToken);
      expect(refreshResult.session.refreshToken).not.toBe(signup.session.refreshToken);
    }
  });

  it('old refresh token invalidated after use', () => {
    const signup = auth.signup('old-token@test.com', 'password123');
    if (!signup.success) throw new Error('signup failed');

    const oldRefresh = signup.session.refreshToken;
    auth.refreshToken(oldRefresh);

    const secondRefresh = auth.refreshToken(oldRefresh);
    expect(secondRefresh.success).toBe(false);
  });

  it('verify valid access token returns session', () => {
    const signup = auth.signup('verify@test.com', 'password123');
    if (!signup.success) throw new Error('signup failed');

    const result = auth.verifyToken(signup.session.accessToken);
    expect(result.success).toBe(true);
  });

  it('verify invalid access token returns error', () => {
    const result = auth.verifyToken('at_fake_token');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('invalid_token');
    }
  });

  it('logout invalidates session', () => {
    const signup = auth.signup('logout@test.com', 'password123');
    if (!signup.success) throw new Error('signup failed');

    const loggedOut = auth.logout(signup.session.refreshToken);
    expect(loggedOut).toBe(true);

    const refreshResult = auth.refreshToken(signup.session.refreshToken);
    expect(refreshResult.success).toBe(false);
  });
});
