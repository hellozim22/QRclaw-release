import { redirect } from 'next/navigation';

export default async function EditAgentRedirect({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents?selected=${agentId}`);
}
