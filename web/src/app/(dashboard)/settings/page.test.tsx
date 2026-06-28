import { render, screen } from '@testing-library/react';
import SettingsPage from './page';

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    loading: false,
    profile: {
      displayName: 'Local User',
      avatarUrl: null,
      initials: 'LU',
    },
  }),
}));

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    auth: {
      updateUser: vi.fn(async () => ({ error: null })),
    },
  }),
}));

vi.mock('@/lib/resize-profile-avatar', () => ({
  resizeProfileAvatarToDataUrl: vi.fn(),
}));

describe('SettingsPage', () => {
  it('shows the desktop update check entry', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '产品更新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '检测更新' })).toBeInTheDocument();
    expect(screen.getByText(/当前版本/)).toBeInTheDocument();
  });
});
