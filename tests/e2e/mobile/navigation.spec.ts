import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mobile E2E Tests (Playwright mobile viewport simulation)
 *
 * Tests mobile-specific user flows per §6 (M1–M7):
 * - Mobile navigation (hamburger menu, bottom tabs)
 * - Mobile chat flow (scan → profile → chat)
 * - Mobile QR scan page
 * - Mobile viewport responsive behavior
 *
 * These are mock-based tests simulating mobile Playwright flows.
 * When real Playwright + backend are ready, convert to browser tests.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface MobileViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

interface NavigationState {
  currentPath: string;
  menuOpen: boolean;
  bottomTabActive: string;
  scrollPosition: number;
}

interface PageRenderResult {
  status: 'ok' | 'error' | 'redirect';
  title: string;
  viewport: MobileViewport;
  elements: string[];
  redirectTo?: string;
}

// ─── Device Presets ─────────────────────────────────────────────────

const DEVICES: Record<string, MobileViewport> = {
  'pixel-5': {
    width: 393,
    height: 851,
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  },
  'iphone-12': {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'iphone-se': {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

// ─── Mock Mobile App ────────────────────────────────────────────────

const createMobileApp = (device: MobileViewport) => {
  const state: NavigationState = {
    currentPath: '/',
    menuOpen: false,
    bottomTabActive: 'chat',
    scrollPosition: 0,
  };

  const pages: Record<string, { title: string; elements: string[] }> = {
    '/': {
      title: 'QRClaw - Scan to Chat',
      elements: ['header', 'scan-button', 'bottom-tabs'],
    },
    '/scan': {
      title: 'Scan QR Code',
      elements: ['camera-viewfinder', 'flash-toggle', 'gallery-button', 'back-button'],
    },
    '/chat': {
      title: 'Chat',
      elements: ['message-list', 'input-bar', 'send-button', 'bottom-tabs'],
    },
    '/chat/conv-001': {
      title: 'Support Bot',
      elements: ['message-list', 'input-bar', 'send-button', 'back-button', 'agent-avatar'],
    },
    '/profile': {
      title: 'Agent Profile',
      elements: ['avatar', 'agent-name', 'description', 'start-chat-button', 'back-button'],
    },
    '/messages': {
      title: 'Messages',
      elements: ['conversation-list', 'search-bar', 'bottom-tabs'],
    },
    '/settings': {
      title: 'Settings',
      elements: ['language-selector', 'theme-toggle', 'version-info', 'back-button'],
    },
  };

  const navigate = (path: string): PageRenderResult => {
    const page = pages[path];
    if (!page) {
      return {
        status: 'error',
        title: '404 Not Found',
        viewport: device,
        elements: ['error-message', 'home-link'],
      };
    }

    state.currentPath = path;
    state.menuOpen = false;

    return {
      status: 'ok',
      title: page.title,
      viewport: device,
      elements: [...page.elements],
    };
  };

  const toggleMenu = (): boolean => {
    state.menuOpen = !state.menuOpen;
    return state.menuOpen;
  };

  const selectBottomTab = (tab: string): NavigationState => {
    const tabRoutes: Record<string, string> = {
      chat: '/chat',
      messages: '/messages',
      scan: '/scan',
      settings: '/settings',
    };

    const route = tabRoutes[tab];
    if (route) {
      state.bottomTabActive = tab;
      state.currentPath = route;
    }

    return { ...state };
  };

  const scrollTo = (position: number): number => {
    state.scrollPosition = Math.max(0, position);
    return state.scrollPosition;
  };

  const getState = (): NavigationState => ({ ...state });

  const isResponsive = (): boolean => device.width <= 768 && device.isMobile;

  return { navigate, toggleMenu, selectBottomTab, scrollTo, getState, isResponsive };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Mobile E2E: Navigation', () => {
  let app: ReturnType<typeof createMobileApp>;

  beforeEach(() => {
    app = createMobileApp(DEVICES['pixel-5']);
    vi.restoreAllMocks();
  });

  it('home page renders with mobile elements', () => {
    const result = app.navigate('/');

    expect(result.status).toBe('ok');
    expect(result.title).toContain('QRClaw');
    expect(result.elements).toContain('scan-button');
    expect(result.elements).toContain('bottom-tabs');
    expect(result.viewport.isMobile).toBe(true);
  });

  it('bottom tab navigation switches pages', () => {
    const chatState = app.selectBottomTab('chat');
    expect(chatState.currentPath).toBe('/chat');
    expect(chatState.bottomTabActive).toBe('chat');

    const messagesState = app.selectBottomTab('messages');
    expect(messagesState.currentPath).toBe('/messages');
    expect(messagesState.bottomTabActive).toBe('messages');

    const scanState = app.selectBottomTab('scan');
    expect(scanState.currentPath).toBe('/scan');
    expect(scanState.bottomTabActive).toBe('scan');
  });

  it('hamburger menu toggles open/close', () => {
    expect(app.getState().menuOpen).toBe(false);

    const opened = app.toggleMenu();
    expect(opened).toBe(true);

    const closed = app.toggleMenu();
    expect(closed).toBe(false);
  });

  it('navigation closes menu automatically', () => {
    app.toggleMenu();
    expect(app.getState().menuOpen).toBe(true);

    app.navigate('/chat');
    expect(app.getState().menuOpen).toBe(false);
  });

  it('404 page for unknown routes', () => {
    const result = app.navigate('/nonexistent');

    expect(result.status).toBe('error');
    expect(result.title).toBe('404 Not Found');
    expect(result.elements).toContain('error-message');
    expect(result.elements).toContain('home-link');
  });

  it('viewport is responsive for mobile devices', () => {
    expect(app.isResponsive()).toBe(true);
  });

  it('scroll position tracks correctly', () => {
    app.scrollTo(500);
    expect(app.getState().scrollPosition).toBe(500);

    app.scrollTo(-10);
    expect(app.getState().scrollPosition).toBe(0);
  });
});

describe('Mobile E2E: Chat Flow', () => {
  let app: ReturnType<typeof createMobileApp>;

  beforeEach(() => {
    app = createMobileApp(DEVICES['iphone-12']);
    vi.restoreAllMocks();
  });

  it('scan → profile → chat flow', () => {
    // Step 1: Open scan page
    const scanPage = app.navigate('/scan');
    expect(scanPage.status).toBe('ok');
    expect(scanPage.elements).toContain('camera-viewfinder');

    // Step 2: After scanning, see agent profile
    const profilePage = app.navigate('/profile');
    expect(profilePage.status).toBe('ok');
    expect(profilePage.elements).toContain('agent-name');
    expect(profilePage.elements).toContain('start-chat-button');

    // Step 3: Start chat
    const chatPage = app.navigate('/chat/conv-001');
    expect(chatPage.status).toBe('ok');
    expect(chatPage.elements).toContain('message-list');
    expect(chatPage.elements).toContain('input-bar');
    expect(chatPage.elements).toContain('send-button');
  });

  it('chat page has agent avatar and back button', () => {
    const chatPage = app.navigate('/chat/conv-001');

    expect(chatPage.elements).toContain('agent-avatar');
    expect(chatPage.elements).toContain('back-button');
  });

  it('scan page has camera controls', () => {
    const scanPage = app.navigate('/scan');

    expect(scanPage.elements).toContain('camera-viewfinder');
    expect(scanPage.elements).toContain('flash-toggle');
    expect(scanPage.elements).toContain('gallery-button');
  });

  it('messages list page shows conversations', () => {
    const messagesPage = app.navigate('/messages');

    expect(messagesPage.status).toBe('ok');
    expect(messagesPage.elements).toContain('conversation-list');
    expect(messagesPage.elements).toContain('search-bar');
  });
});

describe('Mobile E2E: Device Compatibility', () => {
  it('renders on Pixel 5', () => {
    const app = createMobileApp(DEVICES['pixel-5']);
    const result = app.navigate('/');

    expect(result.status).toBe('ok');
    expect(result.viewport.width).toBe(393);
    expect(result.viewport.hasTouch).toBe(true);
  });

  it('renders on iPhone 12', () => {
    const app = createMobileApp(DEVICES['iphone-12']);
    const result = app.navigate('/');

    expect(result.status).toBe('ok');
    expect(result.viewport.width).toBe(390);
    expect(result.viewport.deviceScaleFactor).toBe(3);
  });

  it('renders on iPhone SE (smaller viewport)', () => {
    const app = createMobileApp(DEVICES['iphone-se']);
    const result = app.navigate('/');

    expect(result.status).toBe('ok');
    expect(result.viewport.width).toBe(375);
    expect(result.viewport.height).toBe(667);
  });
});
