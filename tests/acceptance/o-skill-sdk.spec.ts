import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../');
const REQUIREMENTS_DIR = join(PROJECT_ROOT, 'requirements');

async function fileExists(filePath: string): Promise<boolean> {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

test.describe('Module O: Skill SDK & Documentation', () => {
  test('O-01: requirements/ directory exists and has files', async () => {
    const exists = await fileExists(REQUIREMENTS_DIR);
    expect(exists, `requirements/ directory should exist at ${REQUIREMENTS_DIR}`).toBe(true);
  });

  test('O-02: Product requirements doc exists (product-requirements.md)', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'product-requirements.md');
    const exists = await fileExists(filePath);
    expect(exists, 'product-requirements.md should exist in requirements/').toBe(true);
  });

  test('O-03: Technical specification exists', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'technical-specification-v3.0.3-combined.md');
    const exists = await fileExists(filePath);
    expect(exists, 'technical-specification-v3.0.3-combined.md should exist in requirements/').toBe(
      true
    );
  });

  test('O-04: WebSocket protocol documented (technical-specification-supplement-protocol.md)', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'technical-specification-supplement-protocol.md');
    const exists = await fileExists(filePath);
    expect(
      exists,
      'technical-specification-supplement-protocol.md should exist in requirements/'
    ).toBe(true);
  });

  test('O-05: Test strategy documented', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'technical-specification-supplement-testing.md');
    const exists = await fileExists(filePath);
    expect(
      exists,
      'technical-specification-supplement-testing.md should exist in requirements/'
    ).toBe(true);
  });

  test('O-06: Agent teams guide exists', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'agent-teams-guide.md');
    const exists = await fileExists(filePath);
    expect(exists, 'agent-teams-guide.md should exist in requirements/').toBe(true);
  });

  test('O-07: Project plan exists', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'project-plan.md');
    const exists = await fileExists(filePath);
    expect(exists, 'project-plan.md should exist in requirements/').toBe(true);
  });

  test('O-08: Acceptance test plan exists', async () => {
    const filePath = join(REQUIREMENTS_DIR, 'QRClaw-Acceptance-Test-Plan-Local.md');
    const exists = await fileExists(filePath);
    expect(exists, 'QRClaw-Acceptance-Test-Plan-Local.md should exist in requirements/').toBe(true);
  });

  test('O-09: requirements/ directory has at least 5 documents', async () => {
    const exists = await fileExists(REQUIREMENTS_DIR);
    expect(exists, `requirements/ directory should exist at ${REQUIREMENTS_DIR}`).toBe(true);

    const files = readdirSync(REQUIREMENTS_DIR).filter(
      (f) => f.endsWith('.md') || f.endsWith('.pdf')
    );
    expect(files.length).toBeGreaterThanOrEqual(5);
  });
});
