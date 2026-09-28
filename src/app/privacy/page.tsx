import Link from 'next/link';
import type { Metadata } from 'next';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What UnNGL stores, for how long, and what it never will.',
  alternates: { canonical: '/privacy' },
};

const ROWS: Array<[string, string, string]> = [
  [
    'Login codes',
    'HMAC-SHA256 digest only, 10-minute lifetime, single use, at most 5 attempts',
    'Deleted on use or expiry',
  ],
  [
    'Sessions',
    'HMAC-SHA256 digest of a random token, in an httpOnly cookie',
    'Until you sign out or delete your account',
  ],
  ['Email address', 'Plaintext, to sign you in', 'Until you delete your account'],
  [
    'Profile photo',
    'The PNG you uploaded, plus its palette',
    'Until you remove it',
  ],
  [
    'Hint photos',
    'The PNG a sender attached, used to verify the palette, then discarded',
    `Deleted automatically after ${config.retentionDays} days`,
  ],
  [
    'Message text',
    'Plaintext in a SQLite file on the server',
    'Until you or the sender delete it',
  ],
  [
    'IP addresses',
    'An HMAC-SHA256 digest, so we can rate-limit spam without holding the address',
    'Counters only; the digest is never stored against a message',
  ],
  [
    'OAuth tokens',
    'Never stored — exchanged for a profile, then discarded',
    'Immediately',
  ],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="pill pill-outline">plain english</p>
      <h1 className="display-lg mt-4">Privacy</h1>
      <p className="serif-accent mt-3 text-2xl leading-snug">
        We are not selling your data, because we are not collecting data worth selling.
      </p>

      <div className="prose-unngl mt-8">
        <p>
          This page describes the UnNGL software as it is written in this repository. If you
          are using someone else’s deployment, they may have configured it differently — their
          operators are responsible for that, not us.
        </p>

        <h2>What a hint actually is</h2>
        <p>
          When someone attaches a photo to a message, UnNGL computes six colours from it and
          shows those six colours to the reader. The photo itself is never shown, and is
          deleted from the server after {config.retentionDays} days. What is kept forever is
          the palette and the result of our verification.
        </p>

        <h2>What we store</h2>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-0 bg-surface-sunk text-left">
              <th className="p-2">thing</th>
              <th className="p-2">form</th>
              <th className="p-2">kept for</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([a, b, c]) => (
              <tr key={a} className="border-0 align-top">
                <td className="p-2 font-semibold">{a}</td>
                <td className="p-2 text-ink-soft">{b}</td>
                <td className="p-2 text-ink-soft">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="prose-unngl mt-10">
        <h2>What we never do</h2>
        <ul>
          <li>Sell, rent, trade or share anything with anyone.</li>
          <li>Run ads, trackers, analytics or fingerprinting.</li>
          <li>Load a third-party script, font or pixel. This site makes no requests to any domain but its own.</li>
          <li>Store raw IP addresses.</li>
          <li>Use anyone’s photo for machine learning, face recognition, or anything else.</li>
          <li>Send marketing email. There is no mailing list; there is nothing to unsubscribe from.</li>
        </ul>

        <h2>Cookies</h2>
        <p>
          One cookie: <code>unngl_session</code>, an httpOnly session token, strictly
          necessary. Plus <code>unngl_oauth</code> for the few seconds an OAuth round trip
          takes. No advertising or analytics cookies are set.
        </p>

        <h2>Deleting everything</h2>
        <p>
          Deleting an inbox deletes its messages, hints and photos. Deleting your account in{' '}
          <Link href="/settings" className="underline decoration-2 underline-offset-2">
            settings
          </Link>{' '}
          removes your user record, sessions, inboxes and stored images. Because IP digests are
          one-way and salted with a server secret, they cannot be traced back to you even by
          us.
        </p>

        <h2>Contact</h2>
        <p>
          Questions, takedown requests, or a bug that leaks data:{' '}
          <a className="underline decoration-2 underline-offset-2" href={`mailto:${config.contactEmail}`}>
            {config.contactEmail}
          </a>
          . Security issues can be reported privately on the{' '}
          <a
            className="underline decoration-2 underline-offset-2"
            href="https://github.com/AlshyTacohcysp/UnNGL/security/advisories/new"
            target="_blank"
            rel="noreferrer noopener"
          >
            security advisory page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
