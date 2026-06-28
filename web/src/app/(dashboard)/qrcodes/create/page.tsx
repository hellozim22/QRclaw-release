'use client';

import { useState, useCallback, useEffect, useId, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Check,
  Copy,
  Download,
  Loader2,
  QrCode,
  Camera,
  MessageCircle,
  Plus,
} from 'lucide-react';
import { Button, Avatar, Input } from '@/components/ui';
import { useAgents } from '@/hooks/useAgents';
import { createBrowserClient } from '@/lib/supabase';
import { resolveCreateQrDisplayUrls } from '@/lib/create-qrcode-display';
import { needsClientGeneratedQr, buildProfileQrDataUrl } from '@/lib/qr-profile-data-url';
import { createQrcodeViaSupabase } from '@/lib/create-qrcode-direct';
import { downloadImageUrl } from '@/lib/download-image';
import { resizeProfileAvatarToDataUrl } from '@/lib/resize-profile-avatar';
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_MAX } from '@/config/create-qr-defaults';
import type { CreateQrcodeRequest } from '@shared/contracts/http/qrcodes/types';
import {
  PROFILE_AVATAR_MAX_DATA_URL_CHARS,
  PROFILE_AVATAR_DATA_URL_REGEX,
} from '@shared/contracts/http/qrcodes/types';

/**
 * Dashboard Create QR wizard — aligned with design flow:
 * Step0 Select Agent (`Web-CreateQR-Step0-SelectAgent`)
 * Step1 Template (`Web-CreateQR-Step1-Template`)
 * Step2 Configure + live preview (`Web-CreateQR-Step2-Configure` — Name, Description, System Prompt, avatar)
 * Success (`Web-CreateQR-Success`)
 */
type WizardStep = 0 | 1 | 2 | 3;

/** Align with `design/layer/Web-CreateQR-*.png` — 4 steps including Done */
const WIZARD_STEPS = [
  { n: 1, title: 'Agent' },
  { n: 2, title: 'Template' },
  { n: 3, title: 'Configure' },
  { n: 4, title: 'Done' },
] as const;

interface QRCodeResult {
  id: string;
  slug: string;
  status: string;
  profileUrl: string;
  qrImageUrl: string;
  agentId: string;
  /** Public avatar URL after Storage upload, or local preview data URL fallback */
  profileAvatarUrl?: string;
}

interface WizardData {
  agentId: string;
  agentName: string;
  template: string;
  /** Display name on profile / QR (maps to API `name`, design: Name *) */
  name: string;
  description: string;
  systemPrompt: string;
  /** Optional data URL for profile.avatar_url in Supabase profile JSON */
  profileAvatarDataUrl: string | null;
}

const initialData: WizardData = {
  agentId: '',
  agentName: '',
  template: 'default',
  name: '',
  description: '',
  systemPrompt: '',
  profileAvatarDataUrl: null,
};

const StepIndicator = ({ wizardStep }: { wizardStep: WizardStep }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      maxWidth: 900,
      marginBottom: 'var(--space-8)',
    }}
  >
    {WIZARD_STEPS.map((s, i) => {
      const done = wizardStep === 3 ? true : wizardStep > i;
      const active = wizardStep < 3 && wizardStep === i;
      return (
        <div
          key={s.title}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            flex: i < WIZARD_STEPS.length - 1 ? 1 : '0 0 auto',
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: done
                  ? 'var(--color-green)'
                  : active
                    ? 'var(--color-red)'
                    : 'var(--color-gray-100)',
                color: done || active ? 'var(--color-white)' : 'var(--color-gray-500)',
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-bold)',
              }}
            >
              {done ? <Check size={16} strokeWidth={2.5} /> : s.n}
            </div>
            <span
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-md)',
                color: active || done ? 'var(--color-gray-800)' : 'var(--color-gray-500)',
                fontWeight: active ? 'var(--font-semibold)' : 'var(--font-normal)',
                whiteSpace: 'nowrap',
              }}
            >
              {s.title}
            </span>
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                minWidth: 12,
                margin: '0 var(--space-3)',
                background:
                  wizardStep === 3 || wizardStep > i
                    ? 'var(--color-green)'
                    : 'var(--color-gray-200)',
                borderRadius: 1,
              }}
            />
          )}
        </div>
      );
    })}
  </div>
);

function shortAgentId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

const SelectAgentStep = ({
  data,
  onUpdate,
}: {
  data: WizardData;
  onUpdate: (patch: Partial<WizardData>) => void;
}) => {
  const { agents, loading, error } = useAgents();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 720 }}>
      <h3
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-lg)',
          fontWeight: 'var(--font-semibold)',
          color: 'var(--color-gray-800)',
          margin: 0,
        }}
      >
        Select an Agent
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-gray-500)',
          margin: '0 0 var(--space-4)',
          lineHeight: 1.5,
        }}
      >
        Choose which AI agent will be shown when someone scans this QR code.
      </p>
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--space-4)',
            maxWidth: 560,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ height: 88, borderRadius: 12, background: 'var(--color-gray-100)' }}
            />
          ))}
        </div>
      ) : error ? (
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            color: 'var(--color-delete-red)',
          }}
        >
          Failed to load agents. Please try again.
        </p>
      ) : agents.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            color: 'var(--color-gray-500)',
          }}
        >
          No agents available. Create an agent first.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--space-4)',
            maxWidth: 560,
          }}
        >
          {agents.map((agent) => {
            const selected = data.agentId === agent.id;
            return (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onUpdate({ agentId: agent.id, agentName: agent.name })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onUpdate({ agentId: agent.id, agentName: agent.name });
                  }
                }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  border: selected
                    ? '2px solid var(--color-red)'
                    : '1px solid var(--color-gray-border)',
                  cursor: 'pointer',
                  background: selected ? 'var(--color-red-bg)' : 'var(--color-white)',
                  boxSizing: 'border-box',
                  minHeight: 88,
                }}
              >
                {selected ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--color-red)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-hidden
                  >
                    <Check size={14} color="var(--color-white)" strokeWidth={2.5} />
                  </div>
                ) : null}
                <Avatar alt={agent.name} size={48} variant="agent" />
                <div style={{ minWidth: 0, flex: 1, paddingRight: selected ? 20 : 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs, 12px)',
                      color: 'var(--color-gray-500)',
                      marginBottom: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shortAgentId(agent.id)}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-primary)',
                      fontSize: 'var(--text-md)',
                      fontWeight: 'var(--font-semibold)',
                      color: 'var(--color-gray-800)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-primary)',
                      fontSize: 'var(--text-sm)',
                      color:
                        agent.ws_connected || agent.status === 'active'
                          ? 'var(--color-green-text)'
                          : 'var(--color-gray-500)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background:
                          agent.ws_connected || agent.status === 'active'
                            ? 'var(--color-green)'
                            : 'var(--color-gray-300)',
                        flexShrink: 0,
                      }}
                    />
                    {agent.ws_connected || agent.status === 'active' ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TEMPLATE_CARDS: {
  id: string;
  title: string;
  subtitle: string;
  icon: 'headset' | 'chart' | 'mail' | 'custom';
}[] = [
  {
    id: 'default',
    title: 'Customer Service',
    subtitle: 'Friendly support assistant',
    icon: 'headset',
  },
  { id: 'minimal', title: 'Data Analyst', subtitle: 'Insights & reporting', icon: 'chart' },
  { id: 'showcase', title: 'Email Assistant', subtitle: 'Inbox management', icon: 'mail' },
  { id: 'custom', title: 'Custom', subtitle: 'Start with a blank template', icon: 'custom' },
];

function TemplateCardIcon({ kind }: { kind: (typeof TEMPLATE_CARDS)[number]['icon'] }) {
  const wrap = (bg: string, children: ReactNode) => (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
  if (kind === 'headset') {
    return wrap(
      'var(--color-red-bg)',
      <MessageCircle size={26} color="var(--color-red)" strokeWidth={2} />
    );
  }
  if (kind === 'chart') {
    return wrap(
      'rgba(59, 130, 246, 0.12)',
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 20V4M8 16V10M12 14V6M16 18V8M20 12V4"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'mail') {
    return wrap(
      'rgba(234, 179, 8, 0.2)',
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="#CA8A04" strokeWidth="2" />
        <path d="M3 7l9 6 9-6" stroke="#CA8A04" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return wrap(
    'var(--color-gray-100)',
    <Plus size={28} color="var(--color-gray-500)" strokeWidth={2} />
  );
}

const TemplateStep = ({
  data,
  onUpdate,
}: {
  data: WizardData;
  onUpdate: (patch: Partial<WizardData>) => void;
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
    <h3
      style={{
        fontFamily: 'var(--font-primary)',
        fontSize: 'var(--text-lg)',
        fontWeight: 'var(--font-semibold)',
        color: 'var(--color-gray-800)',
        marginBottom: 4,
      }}
    >
      Choose a Template
    </h3>
    <p
      style={{
        fontFamily: 'var(--font-primary)',
        fontSize: 'var(--text-sm)',
        color: 'var(--color-gray-500)',
        margin: 0,
        marginBottom: 'var(--space-4)',
        lineHeight: 1.5,
      }}
    >
      Start from a template or create from scratch
    </p>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {TEMPLATE_CARDS.map((t) => {
        const selected = data.template === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              onUpdate(
                t.id === 'custom'
                  ? { template: t.id, systemPrompt: '', description: '' }
                  : { template: t.id }
              )
            }
            style={{
              textAlign: 'left',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-xl)',
              border: selected
                ? '2px solid var(--color-red)'
                : '1px solid var(--color-gray-border)',
              background: selected ? 'var(--color-red-bg)' : 'var(--color-white)',
              cursor: 'pointer',
              fontFamily: 'var(--font-primary)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 'var(--space-4)',
            }}
          >
            <TemplateCardIcon kind={t.icon} />
            <div>
              <div
                style={{
                  fontSize: 'var(--text-md)',
                  fontWeight: 'var(--font-semibold)',
                  color: 'var(--color-gray-800)',
                  marginBottom: 6,
                }}
              >
                {t.title}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-gray-500)',
                  lineHeight: 1.5,
                }}
              >
                {t.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
    <p
      style={{
        fontFamily: 'var(--font-primary)',
        fontSize: 'var(--text-sm)',
        color: 'var(--color-gray-500)',
        margin: 'var(--space-2) 0 0',
        lineHeight: 1.5,
      }}
    >
      Click a template to auto-fill agent details, or choose Custom for full control.
    </p>
  </div>
);

const ConfigureStep = ({
  data,
  onUpdate,
}: {
  data: WizardData;
  onUpdate: (patch: Partial<WizardData>) => void;
}) => {
  const displayName = data.name.trim() || data.agentName || 'Display Name';
  const fileInputId = useId();
  const [avatarHint, setAvatarHint] = useState<string | null>(null);

  const onAvatarFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const maxBytes = 450_000;
    if (file.size > maxBytes || !/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setAvatarHint('Use PNG, JPG or WebP under 450KB.');
      return;
    }
    setAvatarHint(null);
    void resizeProfileAvatarToDataUrl(file)
      .then((dataUrl) => {
        if (dataUrl.length >= PROFILE_AVATAR_MAX_DATA_URL_CHARS) {
          setAvatarHint('Image is still too large after resize. Try a smaller file.');
          onUpdate({ profileAvatarDataUrl: null });
          return;
        }
        onUpdate({ profileAvatarDataUrl: dataUrl });
      })
      .catch(() => {
        setAvatarHint('Could not process this image. Try another file.');
        onUpdate({ profileAvatarDataUrl: null });
      });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 40,
        alignItems: 'flex-start',
        width: '100%',
        maxWidth: 1040,
      }}
    >
      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-gray-800)',
            margin: 0,
          }}
        >
          Configure Agent Profile
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-gray-500)',
            margin: 'calc(-1 * var(--space-2)) 0 0',
            lineHeight: 1.5,
          }}
        >
          Set up how your agent appears when someone scans the QR code.
        </p>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--color-gray-600)',
            }}
          >
            Upload Avatar
          </span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <Avatar
              alt={data.agentName}
              size={80}
              variant="agent"
              src={data.profileAvatarDataUrl ?? undefined}
            />
            <label
              htmlFor={fileInputId}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAvatarFiles(e.dataTransfer.files);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-1)',
                flex: 1,
                minHeight: 96,
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '2px dashed var(--color-gray-300)',
                background: 'var(--color-gray-50)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <Camera size={24} color="var(--color-gray-400)" strokeWidth={1.5} aria-hidden />
              <span
                style={{
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  color: 'var(--color-gray-600)',
                }}
              >
                Click to upload JPG/PNG
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-xs, 12px)',
                  color: 'var(--color-gray-400)',
                }}
              >
                Max 450KB · WebP OK
              </span>
              <input
                id={fileInputId}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  onAvatarFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {data.profileAvatarDataUrl ? (
            <button
              type="button"
              onClick={() => onUpdate({ profileAvatarDataUrl: null })}
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-red)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                alignSelf: 'flex-start',
              }}
            >
              Remove image
            </button>
          ) : null}
          {avatarHint ? (
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-delete-red)',
                margin: 0,
              }}
            >
              {avatarHint}
            </p>
          ) : null}
        </div>
        <Input
          label="Name *"
          labelMuted
          type="text"
          value={data.name}
          maxLength={40}
          onChange={(e) => {
            onUpdate({ name: e.target.value });
          }}
          placeholder="e.g. Office Reception Bot"
          autoComplete="off"
          id="create-qr-display-name"
          data-testid="create-qrcode-name"
        />
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--color-gray-600)',
            }}
          >
            Description * ({data.description.length}/200)
          </span>
          <textarea
            value={data.description}
            maxLength={200}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Brief description of your agent's role"
            data-testid="create-qrcode-description"
            rows={4}
            style={{
              width: '100%',
              minHeight: 112,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-input-border)',
              padding: '10px var(--space-4)',
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-normal)',
              color: 'var(--color-gray-800)',
              outline: 'none',
              resize: 'vertical',
              background: 'var(--color-white)',
              boxSizing: 'border-box',
            }}
          />
        </label>
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--color-gray-600)',
            }}
          >
            System Prompt * ({data.systemPrompt.length}/{SYSTEM_PROMPT_MAX})
          </span>
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-xs, 12px)',
              color: 'var(--color-gray-500)',
              marginTop: -2,
            }}
          >
            Define how your agent should behave and respond to visitors
          </span>
          <textarea
            value={data.systemPrompt}
            maxLength={SYSTEM_PROMPT_MAX}
            onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            data-testid="create-qrcode-system-prompt"
            rows={5}
            style={{
              width: '100%',
              minHeight: 128,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-input-border)',
              borderLeft: '4px solid var(--color-red)',
              padding: '10px var(--space-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-normal)',
              color: 'var(--color-gray-800)',
              outline: 'none',
              resize: 'vertical',
              background: 'var(--color-white)',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
        </label>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 280,
          justifySelf: 'end',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-gray-800)',
          }}
        >
          Live Preview
        </span>
        <div
          style={{
            width: '100%',
            maxWidth: 260,
            aspectRatio: 'var(--phone-preview-aspect)',
            borderRadius: 'var(--phone-preview-radius)',
            border: '1px solid var(--color-gray-border)',
            background: 'var(--color-white)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-phone-preview)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: 28,
              background: 'var(--color-gray-800)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--color-gray-600)',
              }}
            />
            <div
              style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--color-gray-600)' }}
            />
          </div>
          <div
            style={{
              padding: 'var(--space-5) var(--space-4) var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <Avatar
              alt={data.agentName}
              size={48}
              variant="agent"
              src={data.profileAvatarDataUrl ?? undefined}
            />
            <div
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-gray-800)',
                textAlign: 'center',
              }}
            >
              {displayName}
            </div>
            {data.description ? (
              <p
                style={{
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-xs, 12px)',
                  color: 'var(--color-gray-500)',
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.5,
                  maxWidth: '100%',
                }}
              >
                {data.description}
              </p>
            ) : (
              <p
                style={{
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-xs, 12px)',
                  color: 'var(--color-placeholder)',
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Your description will appear here
              </p>
            )}
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 'var(--radius-md)',
                border: '2px dashed var(--color-gray-300)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-white)',
              }}
            >
              <QrCode size={40} color="var(--color-gray-400)" strokeWidth={1.5} />
            </div>
            <button
              type="button"
              disabled
              aria-label="Message (preview only)"
              style={{
                width: '100%',
                marginTop: 4,
                height: 40,
                borderRadius: 'var(--radius-lg)',
                border: 'none',
                background: 'var(--color-red)',
                color: 'var(--color-white)',
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-semibold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'default',
                opacity: 0.75,
              }}
            >
              <MessageCircle size={18} strokeWidth={2} aria-hidden />
              Message
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SuccessStep = ({
  result,
  displayName,
  profileAvatarSrc,
  successWarnings,
  onCreateAnother,
  onGoToDashboard,
}: {
  result: QRCodeResult | null;
  displayName: string;
  profileAvatarSrc?: string;
  successWarnings?: string[];
  onCreateAnother: () => void;
  onGoToDashboard: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [qrStyle, setQrStyle] = useState<'standard' | 'dark'>('standard');
  const [clientQrDataUrl, setClientQrDataUrl] = useState<string | null>(null);
  const [clientQrFailed, setClientQrFailed] = useState(false);

  const isDark = qrStyle === 'dark';
  const useGeneratedQr = Boolean(result && needsClientGeneratedQr(result.qrImageUrl));
  const displayQrSrc =
    useGeneratedQr && clientQrDataUrl ? clientQrDataUrl : (result?.qrImageUrl ?? '');

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setImgError(false);
      if (!needsClientGeneratedQr(result.qrImageUrl)) {
        setClientQrDataUrl(null);
        setClientQrFailed(false);
        return;
      }
      setClientQrDataUrl(null);
      setClientQrFailed(false);
      void buildProfileQrDataUrl(result.profileUrl, isDark)
        .then((url) => {
          if (!cancelled) setClientQrDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) {
            setClientQrFailed(true);
            setClientQrDataUrl(null);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [result, isDark]);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = result.profileUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQr = () => {
    if (!result) return;
    if (useGeneratedQr) {
      if (!clientQrDataUrl || clientQrFailed) return;
      void downloadImageUrl(clientQrDataUrl, `qrclaw-${result.slug}.png`);
      return;
    }
    if (imgError) return;
    const ext = result.qrImageUrl.startsWith('data:image/svg') ? 'svg' : 'png';
    void downloadImageUrl(result.qrImageUrl, `qrclaw-${result.slug}.${ext}`);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-5)',
        paddingTop: 'var(--space-2)',
        width: '100%',
        maxWidth: 440,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--color-green-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={32} color="var(--color-green)" strokeWidth={2.5} />
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-gray-800)',
          margin: 0,
        }}
      >
        QR Code Created!
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-500)',
          textAlign: 'center',
          margin: 'calc(-1 * var(--space-3)) 0 0',
          lineHeight: 1.5,
        }}
      >
        Your QR code has been generated successfully.
      </p>

      {successWarnings && successWarnings.length > 0 ? (
        <div
          role="status"
          style={{
            width: '100%',
            maxWidth: 360,
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-gray-100)',
            border: '1px solid var(--color-gray-border)',
          }}
        >
          {successWarnings.map((msg) => (
            <p
              key={msg}
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-gray-700)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {msg}
            </p>
          ))}
        </div>
      ) : null}

      {result ? (
        <>
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-gray-border)',
              background: 'var(--color-white)',
              boxShadow: 'var(--shadow-md)',
              padding: 'var(--space-6) var(--space-5)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <Avatar alt={displayName} size={48} variant="agent" src={profileAvatarSrc} />
            <div
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--font-bold)',
                color: isDark ? 'var(--color-white)' : 'var(--color-gray-800)',
                textAlign: 'center',
              }}
            >
              {displayName || 'Your agent'}
            </div>
            <div
              style={{
                width: 168,
                height: 168,
                borderRadius: 'var(--radius-md)',
                background: isDark ? '#111827' : 'var(--color-white)',
                border: `1px solid ${isDark ? '#374151' : 'var(--color-gray-border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              {useGeneratedQr && !clientQrDataUrl && !clientQrFailed ? (
                <span
                  style={{
                    fontFamily: 'var(--font-primary)',
                    fontSize: 'var(--text-xs, 12px)',
                    color: 'var(--color-gray-500)',
                    textAlign: 'center',
                    padding: 'var(--space-2)',
                  }}
                >
                  Generating QR…
                </span>
              ) : imgError || clientQrFailed ? (
                <span
                  style={{
                    fontFamily: 'var(--font-primary)',
                    fontSize: 'var(--text-xs, 12px)',
                    color: 'var(--color-gray-500)',
                    textAlign: 'center',
                    padding: 'var(--space-2)',
                  }}
                >
                  QR preview unavailable
                </span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={displayQrSrc}
                  alt="QR Code"
                  width={152}
                  height={152}
                  style={{ objectFit: 'contain', display: 'block' }}
                  onError={() => setImgError(true)}
                />
              )}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                color: isDark ? 'var(--color-gray-400)' : 'var(--color-gray-500)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Scan to start a conversation
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-gray-600)',
              }}
            >
              Style:
            </span>
            <button
              type="button"
              onClick={() => setQrStyle('standard')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border:
                  qrStyle === 'standard'
                    ? '2px solid var(--color-red)'
                    : '1px solid var(--color-gray-border)',
                background: qrStyle === 'standard' ? 'var(--color-red-bg)' : 'var(--color-white)',
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-gray-800)',
                cursor: 'pointer',
              }}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setQrStyle('dark')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border:
                  qrStyle === 'dark'
                    ? '2px solid var(--color-red)'
                    : '1px solid var(--color-gray-border)',
                background: qrStyle === 'dark' ? 'var(--color-red-bg)' : 'var(--color-white)',
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-gray-800)',
                cursor: 'pointer',
              }}
            >
              Dark
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '10px var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-gray-border)',
              background: 'var(--color-off-white)',
              width: '100%',
              maxWidth: 360,
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-gray-700)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {result.profileUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy profile URL'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: copied ? 'var(--color-green)' : 'var(--color-gray-500)',
                flexShrink: 0,
              }}
              title="Copy URL"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              width: '100%',
              maxWidth: 360,
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={handleDownloadQr}
              disabled={imgError || clientQrFailed || (useGeneratedQr && !clientQrDataUrl)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                flex: '1 1 160px',
                minHeight: 48,
                padding: '0 var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: 'none',
                background: 'var(--color-red)',
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-white)',
                cursor:
                  imgError || clientQrFailed || (useGeneratedQr && !clientQrDataUrl)
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  imgError || clientQrFailed || (useGeneratedQr && !clientQrDataUrl) ? 0.5 : 1,
              }}
            >
              <Download size={18} aria-hidden />
              Download QR
            </button>
            <button
              type="button"
              onClick={onGoToDashboard}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                flex: '1 1 160px',
                minHeight: 48,
                padding: '0 var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-gray-border)',
                background: 'var(--color-white)',
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-gray-800)',
                cursor: 'pointer',
              }}
            >
              Go to Dashboard
            </button>
          </div>

          <button
            type="button"
            onClick={onCreateAnother}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--color-red)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--space-2) 0',
            }}
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden />
            Create another QR Code
          </button>
        </>
      ) : null}
    </div>
  );
};

export default function CreateQRPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QRCodeResult | null>(null);
  const [successWarnings, setSuccessWarnings] = useState<string[]>([]);

  const updateData = (patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!data.agentId;
      case 1:
        return !!data.template;
      case 2:
        return (
          !creating &&
          data.name.trim().length > 0 &&
          data.description.trim().length > 0 &&
          data.systemPrompt.trim().length > 0
        );
      case 3:
        return true;
      default:
        return false;
    }
  };

  const createQRCode = useCallback(async (): Promise<boolean> => {
    setCreating(true);
    setError(null);
    setSuccessWarnings([]);

    try {
      const supabase = createBrowserClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setError('You must be logged in to create a QR code.');
        setCreating(false);
        return false;
      }

      const accessToken = sessionData.session.access_token;
      const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL;

      if (!gatewayUrl) {
        setError('Application configuration error. Please try again later.');
        setCreating(false);
        return false;
      }

      const payload: CreateQrcodeRequest = {
        agent_id: data.agentId,
        name: data.name.trim() || data.agentName,
        greeting: data.description.trim() || undefined,
        template: data.template as CreateQrcodeRequest['template'],
        system_prompt: data.systemPrompt.trim() || undefined,
        profile_avatar:
          data.profileAvatarDataUrl &&
          PROFILE_AVATAR_DATA_URL_REGEX.test(data.profileAvatarDataUrl) &&
          data.profileAvatarDataUrl.length < PROFILE_AVATAR_MAX_DATA_URL_CHARS
            ? data.profileAvatarDataUrl.slice(0, PROFILE_AVATAR_MAX_DATA_URL_CHARS)
            : undefined,
      };

      let qrData: {
        id: string;
        slug: string;
        status: string;
        agent_id: string;
        profile_url?: string;
        warnings?: string[];
      };

      try {
        const response = await fetch(`${gatewayUrl}/api/create-qrcode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let parsed: Record<string, unknown> = {};
        if (text) {
          try {
            parsed = JSON.parse(text) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
        }

        if (!response.ok) {
          const errorMessage =
            (parsed.error as { message?: string } | undefined)?.message ||
            (parsed.message as string | undefined) ||
            'Failed to create QR code. Please try again.';
          setError(errorMessage);
          setCreating(false);
          return false;
        }

        const bodyData = parsed.data;
        if (!bodyData || typeof bodyData !== 'object') {
          setError('Invalid response from server.');
          setCreating(false);
          return false;
        }
        qrData = bodyData as typeof qrData;
      } catch {
        const hasAvatar =
          Boolean(payload.profile_avatar) &&
          typeof payload.profile_avatar === 'string' &&
          payload.profile_avatar.length > 0;
        const direct = await createQrcodeViaSupabase(supabase, {
          agentId: data.agentId,
          name: payload.name,
          greeting: payload.greeting,
          template: payload.template,
          systemPrompt: payload.system_prompt,
          hadProfileAvatar: hasAvatar,
        });
        if (!direct.ok) {
          setError(
            direct.message ||
              'Could not reach the API server. Check your network or try again later.'
          );
          setCreating(false);
          return false;
        }
        qrData = direct.data;
      }
      const origin =
        typeof window !== 'undefined' && typeof window.location?.origin === 'string'
          ? window.location.origin
          : '';
      const { profileUrl, qrImageUrl } = resolveCreateQrDisplayUrls(qrData, origin);
      const apiProfileUrl =
        typeof qrData.profile_url === 'string' && qrData.profile_url.length > 0
          ? qrData.profile_url
          : undefined;
      const profileAvatarUrl = apiProfileUrl ?? data.profileAvatarDataUrl ?? undefined;
      const rawWarnings = Array.isArray(qrData.warnings) ? qrData.warnings : [];
      const humanWarnings: string[] = [];
      for (const w of rawWarnings) {
        if (w === 'gateway_bypass') {
          humanWarnings.push(
            'Created without the live API server (direct save). Profile photo upload may be skipped until the server is available.'
          );
        } else if (w === 'profile_avatar_skipped') {
          if (!humanWarnings.some((m) => m.includes('photo'))) {
            humanWarnings.push(
              'Profile photo was not saved in offline mode. You can add one later from the dashboard.'
            );
          }
        } else if (w === 'system_prompt_truncated') {
          humanWarnings.push('System prompt was limited to 1,000 characters.');
        } else if (
          w === 'profile_avatar_rejected' ||
          w === 'avatar_upload_failed' ||
          w === 'avatar_profile_update_failed' ||
          w === 'avatar_public_url_missing'
        ) {
          if (!humanWarnings.some((m) => m.includes('photo'))) {
            humanWarnings.push(
              'Profile photo could not be saved. You can add one later from the dashboard.'
            );
          }
        }
      }
      setSuccessWarnings(humanWarnings);
      setResult({
        id: qrData.id,
        slug: qrData.slug,
        status: qrData.status,
        profileUrl,
        qrImageUrl,
        agentId: qrData.agent_id,
        profileAvatarUrl,
      });
      setCreating(false);
      return true;
    } catch {
      setError('An unexpected error occurred. Please check your connection and try again.');
      setCreating(false);
      return false;
    }
  }, [
    data.agentId,
    data.name,
    data.agentName,
    data.description,
    data.template,
    data.systemPrompt,
    data.profileAvatarDataUrl,
  ]);

  const handleNext = async () => {
    if (step === 2) {
      const success = await createQRCode();
      if (success) {
        setStep(3);
      }
    } else if (step < 3) {
      setError(null);
      setStep((s) => (s + 1) as WizardStep);
    } else if (step === 3) {
      router.push('/qrcodes');
    }
  };

  const handleBack = () => {
    if (step === 0) {
      router.push('/qrcodes');
    } else if (step === 3) {
      router.push('/qrcodes');
    } else {
      setStep((s) => (s - 1) as WizardStep);
    }
  };

  const primaryLabel = creating
    ? 'Creating...'
    : step === 2
      ? 'Create'
      : step === 3
        ? 'Go to Dashboard'
        : 'Next';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-white)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 24px',
          borderBottom: '1px solid var(--color-gray-border)',
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--color-gray-border)',
            background: 'var(--color-white)',
            cursor: 'pointer',
          }}
        >
          <ChevronLeft size={18} color="var(--color-gray-800)" />
        </button>
        <h2
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-gray-800)',
          }}
        >
          Create QR Code
        </h2>
      </div>

      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        <StepIndicator wizardStep={step} />

        {step === 0 && <SelectAgentStep data={data} onUpdate={updateData} />}
        {step === 1 && <TemplateStep data={data} onUpdate={updateData} />}
        {step === 2 && <ConfigureStep data={data} onUpdate={updateData} />}
        {step === 3 && (
          <SuccessStep
            result={result}
            displayName={data.name.trim() || data.agentName}
            profileAvatarSrc={result?.profileAvatarUrl ?? data.profileAvatarDataUrl ?? undefined}
            successWarnings={successWarnings}
            onCreateAnother={() => {
              setStep(0);
              setData(initialData);
              setResult(null);
              setError(null);
              setSuccessWarnings([]);
            }}
            onGoToDashboard={() => router.push('/qrcodes')}
          />
        )}

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'var(--color-red-bg)',
              border: '1px solid var(--color-delete-red)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-delete-red)',
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          padding: '16px 24px',
          borderTop: '1px solid var(--color-gray-border)',
          flexShrink: 0,
        }}
      >
        {step > 0 && step < 3 && (
          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={handleBack}
            style={{ width: 'auto', minWidth: 120 }}
          >
            Back
          </Button>
        )}
        {step < 3 && (
          <Button
            variant="primary"
            size="lg"
            type="button"
            onClick={handleNext}
            disabled={!canProceed()}
            style={{ width: 'auto', minWidth: step === 2 ? 160 : 120 }}
            data-testid={step === 2 ? 'create-qrcode-submit' : undefined}
            aria-label={step === 2 ? 'Create QR code' : undefined}
          >
            {creating ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Creating...
              </span>
            ) : (
              primaryLabel
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
