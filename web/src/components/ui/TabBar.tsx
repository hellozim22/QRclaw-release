'use client';

import { MessageCircle, User } from 'lucide-react';

interface TabBarProps {
  activeTab: 'messages' | 'me';
  onTabChange: (tab: 'messages' | 'me') => void;
}

interface TabItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabItem = ({ icon, label, isActive, onClick }: TabItemProps) => {
  const activeColor = isActive ? 'var(--color-red)' : 'var(--color-gray-500)';

  const style: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    color: activeColor,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: activeColor,
  };

  return (
    <button style={style} onClick={onClick}>
      {icon}
      <span style={labelStyle}>{label}</span>
    </button>
  );
};

const TabBar = ({ activeTab, onTabChange }: TabBarProps) => {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    height: 'var(--tabbar-height)',
    background: 'var(--color-white)',
    borderTop: '1px solid var(--color-gray-border)',
    flexShrink: 0,
  };

  const messagesActive = activeTab === 'messages';
  const meActive = activeTab === 'me';

  return (
    <div style={containerStyle}>
      <TabItem
        icon={<MessageCircle size={20} color="currentColor" />}
        label="Messages"
        isActive={messagesActive}
        onClick={() => onTabChange('messages')}
      />
      <TabItem
        icon={<User size={20} color="currentColor" />}
        label="Me"
        isActive={meActive}
        onClick={() => onTabChange('me')}
      />
    </div>
  );
};

export default TabBar;
