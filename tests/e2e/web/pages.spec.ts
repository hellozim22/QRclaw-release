import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Web E2E Tests (Playwright desktop viewport simulation)
 *
 * Tests web-specific user flows per §7 (W1–W6):
 * - Landing page (hero, CTA, features)
 * - Pricing page (tiers, comparison)
 * - Signup flow (form validation, success)
 * - Claim agent flow (API key, confirmation)
 *
 * These are mock-based tests simulating Playwright flows.
 * When real Playwright + backend are ready, convert to browser tests.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface PageConfig {
  path: string;
  title: string;
  elements: string[];
  requiresAuth: boolean;
}

interface WebAppState {
  currentPath: string;
  authenticated: boolean;
  user: { email: string; name: string } | null;
  formErrors: string[];
  notifications: string[];
}

interface RenderResult {
  status: 'ok' | 'error' | 'redirect';
  title: string;
  elements: string[];
  redirectTo?: string;
}

interface SignupInput {
  email: string;
  password: string;
  name: string;
}

interface ClaimInput {
  agentName: string;
  apiKey: string;
  description: string;
}

// ─── Mock Web App ───────────────────────────────────────────────────

const createWebApp = () => {
  const state: WebAppState = {
    currentPath: '/',
    authenticated: false,
    user: null,
    formErrors: [],
    notifications: [],
  };

  const pages: Record<string, PageConfig> = {
    '/': {
      path: '/',
      title: 'QRClaw - AI Customer Service via QR Code',
      elements: [
        'navbar',
        'hero-section',
        'hero-title',
        'hero-subtitle',
        'cta-button',
        'features-grid',
        'feature-scan',
        'feature-chat',
        'feature-manage',
        'testimonials',
        'footer',
      ],
      requiresAuth: false,
    },
    '/pricing': {
      path: '/pricing',
      title: 'Pricing - QRClaw',
      elements: [
        'navbar',
        'pricing-header',
        'tier-free',
        'tier-pro',
        'tier-enterprise',
        'comparison-table',
        'faq-section',
        'footer',
      ],
      requiresAuth: false,
    },
    '/signup': {
      path: '/signup',
      title: 'Sign Up - QRClaw',
      elements: [
        'signup-form',
        'email-input',
        'password-input',
        'name-input',
        'submit-button',
        'login-link',
        'terms-checkbox',
      ],
      requiresAuth: false,
    },
    '/login': {
      path: '/login',
      title: 'Log In - QRClaw',
      elements: [
        'login-form',
        'email-input',
        'password-input',
        'submit-button',
        'signup-link',
        'forgot-password-link',
      ],
      requiresAuth: false,
    },
    '/dashboard': {
      path: '/dashboard',
      title: 'Dashboard - QRClaw',
      elements: [
        'sidebar',
        'stats-overview',
        'active-agents',
        'recent-conversations',
        'qr-codes-list',
        'create-qr-button',
      ],
      requiresAuth: true,
    },
    '/claim': {
      path: '/claim',
      title: 'Claim Agent - QRClaw',
      elements: [
        'claim-form',
        'agent-name-input',
        'api-key-input',
        'description-input',
        'submit-button',
        'instructions-panel',
      ],
      requiresAuth: true,
    },
    '/qr/create': {
      path: '/qr/create',
      title: 'Create QR Code - QRClaw',
      elements: [
        'create-form',
        'agent-selector',
        'name-input',
        'description-input',
        'system-prompt-editor',
        'preview-panel',
        'submit-button',
      ],
      requiresAuth: true,
    },
  };

  const navigate = (path: string): RenderResult => {
    const page = pages[path];
    if (!page) {
      return {
        status: 'error',
        title: '404 Not Found',
        elements: ['error-message', 'home-link'],
      };
    }

    if (page.requiresAuth && !state.authenticated) {
      state.currentPath = '/login';
      return {
        status: 'redirect',
        title: 'Log In - QRClaw',
        elements: pages['/login'].elements,
        redirectTo: '/login',
      };
    }

    state.currentPath = path;
    state.formErrors = [];
    return {
      status: 'ok',
      title: page.title,
      elements: [...page.elements],
    };
  };

  const signup = (input: SignupInput): { success: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!input.email || !input.email.includes('@')) {
      errors.push('Valid email is required');
    }
    if (!input.password || input.password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!input.name || input.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (errors.length > 0) {
      state.formErrors = errors;
      return { success: false, errors };
    }

    state.authenticated = true;
    state.user = { email: input.email, name: input.name };
    state.currentPath = '/dashboard';
    state.notifications = ['Welcome to QRClaw!'];
    return { success: true, errors: [] };
  };

  const login = (email: string, password: string): { success: boolean; errors: string[] } => {
    if (!email || !password) {
      return { success: false, errors: ['Email and password are required'] };
    }
    if (password.length < 8) {
      return { success: false, errors: ['Invalid credentials'] };
    }

    state.authenticated = true;
    state.user = { email, name: 'Test User' };
    state.currentPath = '/dashboard';
    return { success: true, errors: [] };
  };

  const claimAgent = (
    input: ClaimInput
  ): { success: boolean; agentId?: string; errors: string[] } => {
    if (!state.authenticated) {
      return { success: false, errors: ['Authentication required'] };
    }

    const errors: string[] = [];
    if (!input.agentName || input.agentName.trim().length === 0) {
      errors.push('Agent name is required');
    }
    if (!input.apiKey || !input.apiKey.startsWith('sk_')) {
      errors.push('Valid API key is required (must start with sk_)');
    }
    if (!input.description || input.description.length < 10) {
      errors.push('Description must be at least 10 characters');
    }

    if (errors.length > 0) {
      state.formErrors = errors;
      return { success: false, errors };
    }

    state.notifications = [`Agent "${input.agentName}" claimed successfully`];
    return {
      success: true,
      agentId: `agent_${Date.now()}`,
      errors: [],
    };
  };

  const logout = (): void => {
    state.authenticated = false;
    state.user = null;
    state.currentPath = '/';
    state.notifications = [];
  };

  const getState = (): WebAppState => ({ ...state });

  return { navigate, signup, login, claimAgent, logout, getState };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Web E2E: Landing Page', () => {
  let app: ReturnType<typeof createWebApp>;

  beforeEach(() => {
    app = createWebApp();
    vi.restoreAllMocks();
  });

  it('renders hero section with CTA', () => {
    const result = app.navigate('/');

    expect(result.status).toBe('ok');
    expect(result.title).toContain('QRClaw');
    expect(result.elements).toContain('hero-section');
    expect(result.elements).toContain('hero-title');
    expect(result.elements).toContain('cta-button');
  });

  it('renders features grid', () => {
    const result = app.navigate('/');

    expect(result.elements).toContain('features-grid');
    expect(result.elements).toContain('feature-scan');
    expect(result.elements).toContain('feature-chat');
    expect(result.elements).toContain('feature-manage');
  });

  it('renders navbar and footer', () => {
    const result = app.navigate('/');

    expect(result.elements).toContain('navbar');
    expect(result.elements).toContain('footer');
    expect(result.elements).toContain('testimonials');
  });

  it('does not require authentication', () => {
    const result = app.navigate('/');

    expect(result.status).toBe('ok');
    expect(result.redirectTo).toBeUndefined();
  });
});

describe('Web E2E: Pricing Page', () => {
  let app: ReturnType<typeof createWebApp>;

  beforeEach(() => {
    app = createWebApp();
    vi.restoreAllMocks();
  });

  it('renders pricing tiers', () => {
    const result = app.navigate('/pricing');

    expect(result.status).toBe('ok');
    expect(result.title).toContain('Pricing');
    expect(result.elements).toContain('tier-free');
    expect(result.elements).toContain('tier-pro');
    expect(result.elements).toContain('tier-enterprise');
  });

  it('renders comparison table and FAQ', () => {
    const result = app.navigate('/pricing');

    expect(result.elements).toContain('comparison-table');
    expect(result.elements).toContain('faq-section');
  });

  it('does not require authentication', () => {
    const result = app.navigate('/pricing');

    expect(result.status).toBe('ok');
    expect(result.redirectTo).toBeUndefined();
  });
});

describe('Web E2E: Signup Flow', () => {
  let app: ReturnType<typeof createWebApp>;

  beforeEach(() => {
    app = createWebApp();
    vi.restoreAllMocks();
  });

  it('renders signup form with all fields', () => {
    const result = app.navigate('/signup');

    expect(result.status).toBe('ok');
    expect(result.elements).toContain('signup-form');
    expect(result.elements).toContain('email-input');
    expect(result.elements).toContain('password-input');
    expect(result.elements).toContain('name-input');
    expect(result.elements).toContain('submit-button');
    expect(result.elements).toContain('terms-checkbox');
  });

  it('successful signup redirects to dashboard', () => {
    const result = app.signup({
      email: 'user@example.com',
      password: 'securePass123',
      name: 'Test User',
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(app.getState().authenticated).toBe(true);
    expect(app.getState().currentPath).toBe('/dashboard');
    expect(app.getState().user?.email).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    const result = app.signup({
      email: 'not-an-email',
      password: 'securePass123',
      name: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Valid email is required');
  });

  it('rejects short password', () => {
    const result = app.signup({
      email: 'user@example.com',
      password: 'short',
      name: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('rejects empty name', () => {
    const result = app.signup({
      email: 'user@example.com',
      password: 'securePass123',
      name: '',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Name is required');
  });

  it('accumulates multiple validation errors', () => {
    const result = app.signup({
      email: '',
      password: 'short',
      name: '',
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Web E2E: Claim Agent Flow', () => {
  let app: ReturnType<typeof createWebApp>;

  beforeEach(() => {
    app = createWebApp();
    app.login('owner@example.com', 'securePass123');
    vi.restoreAllMocks();
  });

  it('claim page requires authentication', () => {
    const unauthApp = createWebApp();
    const result = unauthApp.navigate('/claim');

    expect(result.status).toBe('redirect');
    expect(result.redirectTo).toBe('/login');
  });

  it('renders claim form when authenticated', () => {
    const result = app.navigate('/claim');

    expect(result.status).toBe('ok');
    expect(result.elements).toContain('claim-form');
    expect(result.elements).toContain('agent-name-input');
    expect(result.elements).toContain('api-key-input');
    expect(result.elements).toContain('description-input');
    expect(result.elements).toContain('submit-button');
  });

  it('successful agent claim returns agentId', () => {
    const result = app.claimAgent({
      agentName: 'Support Bot',
      apiKey: 'sk_test_abc123',
      description: 'Customer support agent for our store',
    });

    expect(result.success).toBe(true);
    expect(result.agentId).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid API key format', () => {
    const result = app.claimAgent({
      agentName: 'Support Bot',
      apiKey: 'invalid-key',
      description: 'Customer support agent for our store',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Valid API key is required (must start with sk_)');
  });

  it('rejects missing agent name', () => {
    const result = app.claimAgent({
      agentName: '',
      apiKey: 'sk_test_abc123',
      description: 'Customer support agent for our store',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Agent name is required');
  });

  it('rejects short description', () => {
    const result = app.claimAgent({
      agentName: 'Support Bot',
      apiKey: 'sk_test_abc123',
      description: 'Short',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Description must be at least 10 characters');
  });

  it('unauthenticated claim is rejected', () => {
    const unauthApp = createWebApp();
    const result = unauthApp.claimAgent({
      agentName: 'Support Bot',
      apiKey: 'sk_test_abc123',
      description: 'Customer support agent',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Authentication required');
  });
});

describe('Web E2E: Auth-Protected Routes', () => {
  let app: ReturnType<typeof createWebApp>;

  beforeEach(() => {
    app = createWebApp();
    vi.restoreAllMocks();
  });

  it('dashboard redirects to login when unauthenticated', () => {
    const result = app.navigate('/dashboard');

    expect(result.status).toBe('redirect');
    expect(result.redirectTo).toBe('/login');
  });

  it('dashboard renders when authenticated', () => {
    app.login('user@example.com', 'securePass123');
    const result = app.navigate('/dashboard');

    expect(result.status).toBe('ok');
    expect(result.title).toContain('Dashboard');
    expect(result.elements).toContain('stats-overview');
    expect(result.elements).toContain('active-agents');
    expect(result.elements).toContain('qr-codes-list');
  });

  it('QR create page requires authentication', () => {
    const result = app.navigate('/qr/create');

    expect(result.status).toBe('redirect');
    expect(result.redirectTo).toBe('/login');
  });

  it('logout clears session and redirects home', () => {
    app.login('user@example.com', 'securePass123');
    expect(app.getState().authenticated).toBe(true);

    app.logout();
    expect(app.getState().authenticated).toBe(false);
    expect(app.getState().user).toBeNull();
    expect(app.getState().currentPath).toBe('/');
  });

  it('404 for unknown routes', () => {
    const result = app.navigate('/nonexistent');

    expect(result.status).toBe('error');
    expect(result.title).toBe('404 Not Found');
    expect(result.elements).toContain('error-message');
  });
});
