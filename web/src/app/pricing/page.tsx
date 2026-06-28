import type { Metadata } from 'next';
import PricingPage from '@/components/pricing/PricingPage';

export const metadata: Metadata = {
  title: 'Pricing — QRClaw',
  description: 'Choose the plan that fits your needs. Start free, upgrade when you grow.',
};

export default function Pricing() {
  return <PricingPage />;
}
