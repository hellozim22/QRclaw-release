import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockSupabase } from '../../mocks/supabase';

/**
 * QR Code CRUD Unit Tests
 *
 * Tests QR code lifecycle per §9 qrcodes table schema:
 * - Create QR code → returns with slug and draft status
 * - Update QR code → name/description changed
 * - Pause QR code → status becomes paused
 * - Activate QR code → status becomes active
 * - Revoke QR code → soft deleted (status = revoked)
 * - Invalid status transition → error
 *
 * Status transitions: draft → active ↔ paused → revoked (terminal)
 */

// ─── Types (per §9 qrcodes table) ──────────────────────────────────

type QRCodeStatus = 'draft' | 'active' | 'paused' | 'revoked';

interface QRCode {
  id: string;
  agentId: string;
  slug: string;
  status: QRCodeStatus;
  profile: {
    name?: string;
    description?: string;
    avatarUrl?: string;
  };
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

interface QRCodeCreateInput {
  agentId: string;
  profile?: {
    name?: string;
    description?: string;
  };
  systemPrompt?: string;
}

interface QRCodeUpdateInput {
  profile?: {
    name?: string;
    description?: string;
  };
  systemPrompt?: string;
}

// ─── Valid Status Transitions ───────────────────────────────────────

const VALID_TRANSITIONS: Record<QRCodeStatus, QRCodeStatus[]> = {
  draft: ['active'],
  active: ['paused', 'revoked'],
  paused: ['active', 'revoked'],
  revoked: [], // terminal state
};

// ─── Mock QR Code Service (TDD) ────────────────────────────────────

const generateSlug = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 12; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
};

const createQRCodeStore = () => {
  const store = new Map<string, QRCode>();

  const create = (input: QRCodeCreateInput): QRCode => {
    const now = new Date().toISOString();
    const qrcode: QRCode = {
      id: `qr_${Date.now()}`,
      agentId: input.agentId,
      slug: generateSlug(),
      status: 'draft',
      profile: input.profile ?? {},
      systemPrompt: input.systemPrompt,
      createdAt: now,
      updatedAt: now,
    };
    store.set(qrcode.id, qrcode);
    return { ...qrcode };
  };

  const update = (id: string, input: QRCodeUpdateInput): QRCode => {
    const existing = store.get(id);
    if (!existing) {
      throw new Error('QR code not found');
    }
    if (existing.status === 'revoked') {
      throw new Error('Cannot update revoked QR code');
    }

    const updated: QRCode = {
      ...existing,
      profile: { ...existing.profile, ...input.profile },
      systemPrompt: input.systemPrompt ?? existing.systemPrompt,
      updatedAt: new Date().toISOString(),
    };
    store.set(id, updated);
    return { ...updated };
  };

  const changeStatus = (id: string, newStatus: QRCodeStatus): QRCode => {
    const existing = store.get(id);
    if (!existing) {
      throw new Error('QR code not found');
    }

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${existing.status} → ${newStatus}`);
    }

    const updated: QRCode = {
      ...existing,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    store.set(id, updated);
    return { ...updated };
  };

  const getById = (id: string): QRCode | undefined => {
    const qr = store.get(id);
    return qr ? { ...qr } : undefined;
  };

  return { create, update, changeStatus, getById, _store: store };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('QR Code CRUD', () => {
  let qrStore: ReturnType<typeof createQRCodeStore>;

  beforeEach(() => {
    qrStore = createQRCodeStore();
    vi.restoreAllMocks();
  });

  it('create QR code → returns with slug and draft status', () => {
    const qr = qrStore.create({
      agentId: 'agent-001',
      profile: { name: 'Support Bot', description: 'Customer support' },
      systemPrompt: 'You are a helpful assistant.',
    });

    expect(qr.id).toBeDefined();
    expect(qr.slug).toBeDefined();
    expect(qr.slug.length).toBeGreaterThanOrEqual(12);
    expect(qr.status).toBe('draft');
    expect(qr.agentId).toBe('agent-001');
    expect(qr.profile.name).toBe('Support Bot');
    expect(qr.profile.description).toBe('Customer support');
    expect(qr.systemPrompt).toBe('You are a helpful assistant.');
    expect(qr.createdAt).toBeDefined();
  });

  it('update QR code → name/description changed', () => {
    vi.useFakeTimers({ now: new Date('2026-03-13T10:00:00.000Z') });
    const qr = qrStore.create({ agentId: 'agent-001' });

    vi.advanceTimersByTime(1);
    const updated = qrStore.update(qr.id, {
      profile: { name: 'New Name', description: 'Updated desc' },
    });

    expect(updated.profile.name).toBe('New Name');
    expect(updated.profile.description).toBe('Updated desc');
    expect(updated.updatedAt).not.toBe(qr.createdAt);
    vi.useRealTimers();
  });

  it('pause QR code → status becomes paused', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });

    // draft → active first
    qrStore.changeStatus(qr.id, 'active');

    // active → paused
    const paused = qrStore.changeStatus(qr.id, 'paused');
    expect(paused.status).toBe('paused');
  });

  it('activate QR code → status becomes active', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });

    const activated = qrStore.changeStatus(qr.id, 'active');
    expect(activated.status).toBe('active');
  });

  it('revoke QR code → soft deleted (status = revoked)', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });
    qrStore.changeStatus(qr.id, 'active');

    const revoked = qrStore.changeStatus(qr.id, 'revoked');
    expect(revoked.status).toBe('revoked');

    // Data still exists (soft delete)
    const fetched = qrStore.getById(qr.id);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe('revoked');
  });

  it('invalid status transition → throws error', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });

    // draft → paused is NOT allowed (must go draft → active first)
    expect(() => qrStore.changeStatus(qr.id, 'paused')).toThrow(
      'Invalid status transition: draft → paused'
    );
  });

  it('cannot update revoked QR code', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });
    qrStore.changeStatus(qr.id, 'active');
    qrStore.changeStatus(qr.id, 'revoked');

    expect(() => qrStore.update(qr.id, { profile: { name: 'Nope' } })).toThrow(
      'Cannot update revoked QR code'
    );
  });

  it('revoked → any status is not allowed (terminal state)', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });
    qrStore.changeStatus(qr.id, 'active');
    qrStore.changeStatus(qr.id, 'revoked');

    expect(() => qrStore.changeStatus(qr.id, 'active')).toThrow(
      'Invalid status transition: revoked → active'
    );
  });

  it('paused → active re-activation works', () => {
    const qr = qrStore.create({ agentId: 'agent-001' });
    qrStore.changeStatus(qr.id, 'active');
    qrStore.changeStatus(qr.id, 'paused');

    const reactivated = qrStore.changeStatus(qr.id, 'active');
    expect(reactivated.status).toBe('active');
  });
});
