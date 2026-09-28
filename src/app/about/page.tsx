import Link from 'next/link';
import type { Metadata } from 'next';
import { config } from '@/lib/config';
import { ALGORITHM_VERSION } from '@/lib/palette/extract';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why UnNGL exists, and how to run your own copy.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="pill pill-outline">why</p>
      <h1 className="display-lg mt-4">A free alternative, done honestly</h1>

      <div className="prose-unngl mt-8">
        <p className="serif-accent text-2xl leading-snug">
          The pattern is well worn: an app gives you a link, strangers write to you, and then
          the app charges you to find out who they were.
        </p>
        <p>
          That is not a bug in the product — it is the business model. The hints are cheap to
          generate and expensive to look at, so the app takes a payment, gives you something
          vague, and keeps most of the money. The FTC has gone after exactly this kind of
          design, including around children’s data.
        </p>
        <p>
          UnNGL takes the opposite position on every axis:
        </p>
        <ul>
          <li>
            <strong>Free means free.</strong> There is no purchase button, no currency, and no
            feature that unlocks after a payment. The whole hint is always visible.
          </li>
          <li>
            <strong>The hint should be worth something.</strong> A palette extracted from
            someone’s profile photo is a genuine identifier for people who know you and a
            useless one for people who don’t. That is the right shape for privacy: revealing
            something to the people who already know you, and nothing to the people who don’t.
          </li>
          <li>
            <strong>Show the working.</strong> The algorithm is{' '}
            <Link href="/algorithm" className="underline decoration-2 underline-offset-2">
              published in full
            </Link>{' '}
            and hashed, so the claim “this is their colour palette” is checkable rather than
            merely asserted.
          </li>
          <li>
            <strong>Nothing to sell.</strong> The data an app like this collects is worth
            selling precisely because the app is collecting it. UnNGL deletes photos on a
            timer, never stores IP addresses, and has no analytics.
          </li>
        </ul>

        <h2>Run your own</h2>
        <p>
          This is the whole application: a Next.js server and one SQLite file. Clone it,{' '}
          <code>npm install</code>, <code>npm run build</code>, <code>npm start</code>. There
          is no external database, no Redis, no queue, and no paid service to sign up for.
        </p>
        <p>
          If you self-host, you are the operator: you decide the retention window, whether to
          add a CAPTCHA, and what your privacy policy says. That responsibility is part of the
          deal, and the defaults here are the ones we would ship.
        </p>

        <h2>Stack, and why</h2>
        <ul>
          <li>
            <strong>Next.js + TypeScript</strong> — one deployable, server and client in the
            same codebase, no separate API to run.
          </li>
          <li>
            <strong>SQLite via Node&rsquo;s built-in driver</strong> — no native module to
            compile, no server to administer, and the entire state of the service is a file
            you can back up by copying it.
          </li>
          <li>
            <strong>No image library</strong> — the browser transcodes uploads to PNG and the
            server decodes PNG with about 200 lines of code. That is what lets the server
            re-derive a hint and check it, with no native dependency in the picture.
          </li>
          <li>
            <strong>Auth we wrote</strong> — six-digit codes, HMAC digests, one generic OAuth
            client. Adding a provider is a table entry.
          </li>
        </ul>

        <h2>On Instagram sign-in</h2>
        <p>
          The brief asked for Instagram first. Meta retired the Instagram Basic Display API in
          December 2024, so no ordinary app can read a profile that way any more — we would be
          shipping a button that cannot work. What is left is Facebook Login, which can carry
          an Instagram username, so that is the provider entry called{' '}
          <em>Facebook / Instagram</em>. For the palette itself none of this matters: a photo
          and a documented algorithm is all a hint needs.
        </p>

        <h2>Licence</h2>
        <p>
          AGPL-3.0-or-later. If you run a modified UnNGL as a service, publish your changes.
          That is the entire point of the licence, and it is why this project is worth
          building in the open.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/login" className="btn btn-primary">
          Get a link
        </Link>
        <a
          className="btn"
          href="https://github.com/AlshyTacohcysp/UnNGL"
          target="_blank"
          rel="noreferrer noopener"
        >
          Source
        </a>
        <a className="btn" href={`mailto:${config.contactEmail}`}>
          Say hello
        </a>
      </div>

      <p className="font-mono text-[0.68rem] mt-8 text-ink-soft">
        palette v{ALGORITHM_VERSION} · not affiliated with NGL
      </p>
    </div>
  );
}
