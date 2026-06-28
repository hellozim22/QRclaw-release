'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { createClient } from '@/lib/supabase/browser';
import { resizeProfileAvatarToDataUrl } from '@/lib/resize-profile-avatar';
import { Avatar } from '@/components/ui';
import {
  checkDesktopForUpdates,
  getDesktopAppVersion,
  isDesktopMode,
  type DesktopAppVersion,
  type DesktopUpdateCheckResult,
} from '@/lib/desktop-bridge';

export default function SettingsPage() {
  const { profile, loading } = useProfile();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savedDisplayName, setSavedDisplayName] = useState('');
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<DesktopAppVersion | null>(null);
  const [updateResult, setUpdateResult] = useState<DesktopUpdateCheckResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const desktopMode = isDesktopMode();

  useEffect(() => {
    if (profile && !initialized) {
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl);
      setSavedDisplayName(profile.displayName);
      setSavedAvatarUrl(profile.avatarUrl);
      setInitialized(true);
    }
  }, [profile, initialized]);

  useEffect(() => {
    if (!desktopMode) return;
    let mounted = true;
    void getDesktopAppVersion().then((version) => {
      if (mounted) setDesktopVersion(version);
    });
    return () => {
      mounted = false;
    };
  }, [desktopMode]);

  const handleSaveProfile = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: '显示名称不能为空' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: trimmed,
        avatar_url: avatarUrl,
      },
    });

    setSaving(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setSavedDisplayName(trimmed);
      setSavedAvatarUrl(avatarUrl);
      setDisplayName(trimmed);
      setMessage({ type: 'success', text: '已保存' });
    }
  };

  const handleAvatarPick = async (file: File) => {
    try {
      const dataUrl = await resizeProfileAvatarToDataUrl(file, 0.82, {
        maxEdge: 128,
        outputMime: 'image/jpeg',
      });
      setAvatarUrl(dataUrl);
      setMessage({ type: 'success', text: '头像已选择，点击保存后生效' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '头像处理失败',
      });
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    const result = await checkDesktopForUpdates();
    setUpdateResult(result);
    setCheckingUpdate(false);
  };

  const nameDirty = initialized && displayName.trim() !== savedDisplayName;
  const avatarDirty = initialized && avatarUrl !== savedAvatarUrl;
  const dirty = nameDirty || avatarDirty;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-white)',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--color-gray-800)',
            margin: 0,
            marginBottom: 8,
          }}
        >
          个人中心
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            color: 'var(--color-gray-500)',
            margin: '0 0 28px',
            maxWidth: 520,
            lineHeight: 1.5,
          }}
        >
          设置你在对话中显示的头像与名称。Agent 配置请前往 Agents 页。
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 28,
            maxWidth: 520,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || saving}
            aria-label="更换头像"
            style={{
              position: 'relative',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: loading || saving ? 'not-allowed' : 'pointer',
              borderRadius: '50%',
            }}
          >
            <Avatar
              src={avatarUrl ?? undefined}
              alt={displayName || '用户'}
              size={72}
              variant="user"
              initials={profile?.initials ?? '..'}
            />
            <span
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 28,
                height: 28,
                borderRadius: 14,
                background: 'var(--color-gray-800)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--color-white)',
              }}
            >
              <Camera size={14} color="var(--color-white)" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatarPick(file);
              e.target.value = '';
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-gray-800)',
              }}
            >
              {displayName || profile?.displayName || (loading ? '加载中…' : '本地用户')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                color: 'var(--color-gray-500)',
                marginTop: 4,
              }}
            >
              点击头像上传图片（PNG / JPG / WebP）
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 520, marginBottom: 24 }}>
          <label
            htmlFor="account-display-name"
            style={{
              display: 'block',
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-gray-700)',
              marginBottom: 6,
            }}
          >
            显示名称
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              id="account-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              placeholder="在界面中显示的名称"
              style={{
                flex: 1,
                height: 44,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--color-gray-border)',
                fontFamily: 'var(--font-primary)',
                fontSize: 14,
                color: 'var(--color-gray-800)',
                outline: 'none',
                background: 'var(--color-white)',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={saving || loading || !dirty}
              style={{
                height: 44,
                padding: '0 18px',
                borderRadius: 8,
                border: 'none',
                background:
                  saving || loading || !dirty ? 'var(--color-gray-300)' : 'var(--color-red)',
                fontFamily: 'var(--font-primary)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-white)',
                cursor: saving || loading || !dirty ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
          {message && (
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                color: message.type === 'success' ? 'var(--color-green-text)' : 'var(--color-red)',
              }}
            >
              {message.text}
            </p>
          )}
        </div>

        <section
          aria-label="产品更新"
          style={{
            maxWidth: 520,
            marginTop: 10,
            padding: 18,
            borderRadius: 12,
            border: '1px solid var(--color-gray-border)',
            background: 'var(--surface-card)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-primary)',
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--color-gray-800)',
                }}
              >
                产品更新
              </h3>
              <p
                style={{
                  margin: '6px 0 0',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--color-gray-500)',
                }}
              >
                当前版本 {desktopVersion?.currentVersion ?? '0.1.0'}
                {desktopVersion?.currentBuild ? ` (${desktopVersion.currentBuild})` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCheckUpdates()}
              disabled={!desktopMode || checkingUpdate}
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 8,
                border: '1px solid var(--color-gray-border)',
                background: desktopMode ? 'var(--color-white)' : 'var(--color-gray-100)',
                color: desktopMode ? 'var(--color-gray-800)' : 'var(--color-gray-500)',
                cursor: desktopMode && !checkingUpdate ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-primary)',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {checkingUpdate ? '检测中…' : '检测更新'}
            </button>
          </div>
          <p
            style={{
              margin: '12px 0 0',
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              lineHeight: 1.5,
              color:
                updateResult?.status === 'error' || updateResult?.status === 'not_configured'
                  ? 'var(--color-red)'
                  : 'var(--color-gray-500)',
            }}
          >
            {!desktopMode
              ? '更新检测仅在 QRClaw macOS 桌面应用中可用。'
              : updateResult?.message ??
                (desktopVersion?.configured === false
                  ? '当前构建尚未配置正式更新源。'
                  : '点击后会通过 macOS 原生更新器检查新版本。')}
          </p>
        </section>
      </div>
    </div>
  );
}
