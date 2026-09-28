import type { Metadata } from 'next';
import { HowItWorks } from '@/components/how-it-works';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'UnNGL — anonymous messages, free colour hints',
  description:
    'The free, open source alternative to NGL. Share a link, receive anonymous messages, and reveal the sender\u2019s entire colour palette \u2014 for free, with the algorithm published in full.',
  alternates: { canonical: '/' },
};

export default function Home() {
  return <HowItWorks />;
}
