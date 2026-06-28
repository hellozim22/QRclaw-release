import { redirect } from 'next/navigation';
import MessagesPage from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('MessagesPage', () => {
  it('redirects the legacy messages route to chat', () => {
    MessagesPage();

    expect(redirect).toHaveBeenCalledWith('/chat');
  });
});
