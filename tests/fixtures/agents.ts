import { createTestAgent } from '../helpers/factories';

export const testAgent = createTestAgent({
  id: '00000000-0000-0000-0000-000000000010',
  ownerId: '00000000-0000-0000-0000-000000000001',
  name: 'Test Support Agent',
  model: 'gpt-4',
});

export const testAgent2 = createTestAgent({
  id: '00000000-0000-0000-0000-000000000011',
  ownerId: '00000000-0000-0000-0000-000000000002',
  name: 'Test Sales Agent',
  model: 'claude-3-opus',
});
