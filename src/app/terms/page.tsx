import Link from 'next/link';
import type { Metadata } from 'next';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The rules of UnNGL, kept short on purpose.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="pill pill-outline">the small print</p>
      <h1 className="display-lg mt-4">Terms</h1>

      <div className="prose-unngl mt-8">
        <p>
          These terms describe the UnNGL software. They are written to be read, which is why
          they fit on one page. The software is licensed AGPL-3.0-or-later; running your own
          copy is encouraged.
        </p>

        <h2>1. What the service is</h2>
        <p>
          UnNGL lets anyone with a link send an anonymous message to an inbox, optionally
          attached to a colour palette derived from a photo. It is free, and there is no paid
          tier, no “credits”, and no purchase of any kind.
        </p>

        <h2>2. Your link is the credential</h2>
        <p>
          An inbox link grants full read and delete access to that inbox. If you post it
          publicly, anyone can read and destroy what arrives. Rotate the link if that happens;
          the old one stops working immediately.
        </p>

        <h2>3. What you may not send</h2>
        <ul>
          <li>Content that is illegal where you are, or that sexualises a minor.</li>
          <li>Harassment, threats, or content aimed at causing someone real harm.</li>
          <li>Spam, bulk automation, or attempts to flood an inbox.</li>
          <li>Someone else’s photograph, attached to make them look like something they are not.</li>
        </ul>
        <p>
          Operators of a deployment may remove content or links. This repository contains a
          rate limiter and a honeypot; it does not contain a moderation queue, because a
          queue for anonymous messages would be its own privacy problem.
        </p>

        <h2>4. No warranty</h2>
        <p>
          UnNGL is provided “as is”, without warranty of any kind. Palettes are a description
          of colours, not evidence of identity. Two people can share a palette. Nobody is
          required to be who their colours suggest.
        </p>

        <h2>5. Liability</h2>
        <p>
          To the maximum extent permitted by law, the authors and copyright holders are not
          liable for any claim, damages or other liability arising from the software or its use.
        </p>

        <h2>6. Data</h2>
        <p>
          The data handling that matters is on the{' '}
          <Link href="/privacy" className="underline decoration-2 underline-offset-2">
            privacy page
          </Link>
          . In short: nothing is sold, photos are deleted on a timer, IPs are not stored.
        </p>

        <h2>7. Changes</h2>
        <p>
          Terms may change as the software does. The version in the repository at the commit
          you deployed is the one that applies to your instance.
        </p>
      </div>

      <p className="font-mono text-[0.68rem] mt-10 text-ink-soft">
        questions? <a className="underline" href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
      </p>
    </div>
  );
}
