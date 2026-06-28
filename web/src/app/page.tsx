import { redirect } from 'next/navigation';
import LandingPage from '@/components/landing/LandingPage';

/**
 * 本地 v1：根路径直达 Chat；非本地仍保留 Landing（legacy）。
 */
export default function Home() {
  if (process.env.NEXT_PUBLIC_LOCAL_DEV === '1') {
    redirect('/chat');
  }
  return <LandingPage />;
}
