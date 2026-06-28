import EditAgentRedirect from './page';

const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (href: string) => redirectMock(href),
}));

describe('EditAgentRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects legacy edit route to the merged Agents detail panel', async () => {
    await EditAgentRedirect({
      params: Promise.resolve({ agentId: 'agent-1' }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/agents?selected=agent-1');
  });
});
