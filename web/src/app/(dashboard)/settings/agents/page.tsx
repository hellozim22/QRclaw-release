import { redirect } from 'next/navigation';

/** Legacy plugin/SDK agent management — use dashboard /agents for Owner Agent Host. */
export default function LegacySettingsAgentsPage() {
  redirect('/agents');
}
