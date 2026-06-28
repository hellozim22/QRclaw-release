import type { Metadata } from 'next';
import DocsPage from '@/components/docs/DocsPage';

export const metadata: Metadata = {
  title: 'Documentation — QRClaw',
  description:
    'Learn how to set up and use QRClaw to connect your AI agents with QR codes.',
};

export default function Docs() {
  return <DocsPage />;
}
