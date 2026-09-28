import Link from 'next/link';
import type { Metadata } from 'next';
import { PaletteBars, PaletteCollage } from '@/components/palette-collage';
import { SAMPLE_LIST, SUNSET, NEON, STUDIO } from '@/lib/samples.generated';
import { ALGORITHM_VERSION } from '@/lib/palette/extract';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'UnNGL — anonymous messages with a free colour hint',
  description:
    'The free, open source alternative to NGL. Share a link, receive anonymous messages, and reveal the sender’s entire colour palette — for free, with the algorithm published in full.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const user = await currentUser();

  return (
    <>
      {/* ---------------------------------------------------------------- *
       * hero
       * ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <div className="flex flex-wrap items-center gap-3">
            <span className="stamp">100% free hints</span>
            <span className="mono-chip border-[2.5px] border-ink bg-paper px-2 py-1">
              no data sold · no paywall · AGPL
            </span>
          </div>

          <h1 className="display-xl mt-6 max-w-5xl">
            Anonymous messages.
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 bg-acid px-3 pb-1">Free colour</span>
            </span>{' '}
            hints.
          </h1>

          <p className="serif-accent mt-6 max-w-2xl text-2xl leading-snug sm:text-3xl">
            NGL charges you to find out who wrote to you. We hand you their whole
            colour palette instead — <em>their actual colours</em>, pulled from their
            profile photo — and we never ask for a cent.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href={user ? '/inbox' : '/login'} className="btn btn-punch text-lg">
              Get your link →
            </Link>
            <Link href="/algorithm" className="btn text-lg">
              Read the algorithm
            </Link>
          </div>

          <p className="mono-chip mt-4 text-ink-soft">
            palette v{ALGORITHM_VERSION} · oklab · 6 colours · deterministic
          </p>
        </div>

        {/* collage strip */}
        <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card card-lift tilt-a p-4 sm:col-span-2 lg:col-span-1 lg:order-2 lg:row-span-2">
              <PaletteCollage
                colors={SUNSET.colors}
                footnote
                algorithm={ALGORITHM_VERSION}
                verified
              />
              <p className="mt-3 text-sm leading-snug text-ink-soft">
                A hint is six colours, in order, with a hash you can check yourself.
              </p>
            </div>

            <div className="card card-lift tilt-c relative p-4">
              <p className="label">What they send you</p>
              <p className="text-lg leading-snug">
                “is anyone actually going to reply to this or do i have to keep being
                the interesting one”
              </p>
              <p className="mono-chip mt-3 text-ink-soft">no hint attached</p>
            </div>

            <div className="card card-lift tilt-b relative p-4">
              <p className="label">What you get back</p>
              <PaletteCollage colors={NEON.colors} />
              <p className="mt-3 text-sm leading-snug text-ink-soft">
                Magenta, cyan, deep blue. Probably them. <strong>Free.</strong>
              </p>
            </div>

            <div className="card card-lift tilt-a relative p-4 sm:col-span-2">
              <p className="label">Why a palette and not a photo</p>
              <p className="max-w-prose leading-relaxed">
                Colours are enough to recognise someone you know and useless against
                someone you don’t. It’s a fingerprint with most of the face removed —
                and it can’t be reverse-searched, scraped, or sold.
              </p>
              <div className="mt-4">
                <PaletteBars colors={STUDIO.colors} height={18} className="max-w-xs" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * comparison
       * ---------------------------------------------------------------- */}
      <section className="border-y-[2.5px] border-ink bg-paper-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="display-lg">The difference is the point</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="card bg-paper p-6">
              <p className="label text-ink-soft">The app this is an alternative to</p>
              <ul className="mt-4 flex flex-col gap-3">
                <li className="flex gap-3">
                  <span className="mt-1 block h-4 w-4 shrink-0 border-2 border-ink bg-punch" />
                  <span>“Hints” are a paid in-app purchase, per message.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 block h-4 w-4 shrink-0 border-2 border-ink bg-punch" />
                  <span>Many hints are vague, wrong, or not worth the price.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 block h-4 w-4 shrink-0 border-2 border-ink bg-punch" />
                  <span>Closed source, ad-supported, and the FTC has gone after
                    practices around children’s data.</span>
                </li>
              </ul>
            </div>

            <div className="card bg-acid p-6">
              <p className="label">UnNGL</p>
              <ul className="mt-4 flex flex-col gap-3">
                <li className="flex gap-3">
                  <span className="mt-1 block h-4 w-4 shrink-0 border-2 border-ink bg-ink" />
                  <span>Every hint is free. There is no purchase button anywhere.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 block h-4 w-4 shrink-0 border-2 border-ink bg-ink" />
                  <span>The algorithm is published, versioned and hash-checkable.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 block h-4 w-4 shrink-0 border-2 border-ink bg-ink" />
                  <span>AGPL source. We hold nothing you can be sold, and hold it for
                    days, not years.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * how it works
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="display-lg">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              n: '01',
              t: 'Get a link',
              d: 'Sign in with email — or an OAuth provider — and you get a short link that is your inbox. Anyone who has it can write to you.',
              c: 'bg-sun',
            },
            {
              n: '02',
              t: 'They write, anonymously',
              d: 'No account, no name, no number. They can attach a photo purely so you can see their colours. The photo is deleted after we check it.',
              c: 'bg-sky',
            },
            {
              n: '03',
              t: 'You see their palette',
              d: 'Six colours, computed on your screen and recomputed on ours. If the two disagree we say so. That is the whole product.',
              c: 'bg-grape',
            },
          ].map((step) => (
            <div key={step.n} className="card card-lift relative p-6">
              <span
                className={`absolute -top-4 -right-3 grid h-12 w-12 place-items-center border-[2.5px] border-ink ${step.c} text-lg font-extrabold shadow-hard-sm`}
              >
                {step.n}
              </span>
              <h3 className="mt-2 text-2xl">{step.t}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * all the palettes
       * ---------------------------------------------------------------- */}
      <section className="border-y-[2.5px] border-ink bg-paper-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="display-lg">Every hint, in full</h2>
              <p className="serif-accent mt-2 text-2xl">
                No blur, no “tap to unlock”, no upsell.
              </p>
            </div>
            <Link href="/algorithm" className="btn">
              How these are computed →
            </Link>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {SAMPLE_LIST.map((p, i) => (
              <div key={p.hash} className={`card card-lift p-4 ${i % 2 ? 'tilt-b' : 'tilt-a'}`}>
                <PaletteCollage colors={p.colors} footnote verified algorithm={ALGORITHM_VERSION} />
              </div>
            ))}
          </div>
          <p className="mono-chip mt-6 text-ink-soft">
            These four are real outputs of the published algorithm over synthetic
            test images — see scripts/samples.ts.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * privacy
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="display-lg">What we keep, and for how long</h2>
            <p className="serif-accent mt-3 text-xl leading-snug">
              A privacy policy is only worth reading if it is short.
            </p>
          </div>
          <dl className="flex flex-col gap-4">
            {[
              ['Your photos', 'Deleted 7 days after the palette is computed. We keep the colours and the verification result, not the face.'],
              ['IP addresses', 'Never stored. Hashed with a server secret so we can rate-limit spam, then discarded.'],
              ['Your email', 'Only to sign you in. Never sold, never shared, no marketing list, no unsubscribe because there is nothing to unsubscribe from.'],
              ['Your messages', 'Live in a SQLite file you control. Delete an inbox and it is gone.'],
            ].map(([k, v]) => (
              <div key={k} className="card-flat p-4">
                <dt className="label">{k}</dt>
                <dd className="leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/privacy" className="btn">
            Read the privacy policy
          </Link>
          <Link href="/about" className="btn">
            Why we built it
          </Link>
        </div>
      </section>
    </>
  );
}
