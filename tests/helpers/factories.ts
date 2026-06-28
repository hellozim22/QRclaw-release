import { randomUUID } from 'crypto';

interface UserFixture {
  id: string;
  email: string;
  role: string;
}

interface VisitorFixture {
  sessionId: string;
  sessionToken: string;
  qrcodeId: string;
}

interface AgentFixture {
  id: string;
  ownerId: string;
  apiKey: string;
  name: string;
  model: string;
}

export const createTestOwner = (overrides: Partial<UserFixture> = {}): UserFixture => ({
  id: randomUUID(),
  email: 'owner@test.qrclaw.ai',
  role: 'owner',
  ...overrides,
});

export const createTestVisitor = (overrides: Partial<VisitorFixture> = {}): VisitorFixture => ({
  sessionId: randomUUID(),
  sessionToken: `sess_${randomUUID().replace(/-/g, '')}`,
  qrcodeId: randomUUID(),
  ...overrides,
});

export const createTestAgent = (overrides: Partial<AgentFixture> = {}): AgentFixture => ({
  id: randomUUID(),
  ownerId: randomUUID(),
  apiKey: `sk_test_${randomUUID().replace(/-/g, '')}`,
  name: 'Test Agent',
  model: 'gpt-4',
  ...overrides,
});
