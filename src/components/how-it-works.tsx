/**
 * The "how it works" screen from the mockup.
 *
 * Three things, in this order, because this is the order of the argument:
 * what you send, what travels, what never does. The diagram in the middle is
 * the whole product in one line of shapes — photo in, six colours out, message
 * across. The three guarantees underneath are each tied to a colour, so the
 * page is also a demonstration of what a hint looks like.
 *
 * @license AGPL-3.0-or-later
 */

import Link from 'next/link';
import { BlobCollage, CollageHeader, type Blob } from './blob-collage';
import { PaletteBlobs, PaletteDots } from './palette-strip';
import { SAMPLE_LIST } from '@/lib/samples.generated';

const GITHUB = 'https://github.com/AlshyTacohcysp/UnNGL';

/** The guarantees. Each owns one of the six colours. */
const GUARANTEES = [
  {
    color: 'var(--color-teal)',
    tint: 'color-mix(in oklab, var(--color-teal) 16%, var(--color-surface))',
    title: 'The photo never leaves your device',
    body: 'It is read in your browser, reduced to six colours, and only those six colours are uploaded. The image is never sent to us.',
  },
  {
    color: 'var(--color-indigo)',
    tint: 'color-mix(in oklab, var(--color-indigo) 12%, var(--color-surface))',
    title: 'The photo is deleted immediately',
    body: 'After we recompute the colours on our side to check them, the original is gone. There is no copy, no backup, no archive.',
  },
  {
    color: 'var(--color-amber)',
    tint: 'color-mix(in oklab, var(--color-amber) 20%, var(--color-surface))',
    title: 'Nothing is ever sold',
    body: 'No accounts to advertise to, no data broker, no paywall. The source is AGPL and you can read every line of it.',
  },
] as const;

/** A small collage for the header — the send page's, pulled in tighter. */
const HEADER_BLOBS: Blob[] = [
  { color: 'var(--color-teal)', left: -16, top: -40, size: 70, shape: 1, z: 2 },
  { color: 'var(--color-amber)', left: 26, top: -50, size: 66, shape: 0, z: 1 },
  { color: 'var(--color-indigo)', left: 62, top: -36, size: 62, shape: 2, z: 2 },
  { color: 'var(--color-pink)', left: 8, top: 26, size: 48, shape: 3, z: 1 },
  { color: 'var(--color-coral)', left: 70, top: 34, size: 44, shape: 4, z: 3 },
];

export function HowItWorks() {
  const sample = SAMPLE_LIST[0];

  return (
    <div className="pb-24">
      {/* 1. collage + the claim */}
      <CollageHeader className="px-4 pt-8 pb-20 sm:px-6" blobs={HEADER_BLOBS}>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="display-xl">
            Your 6 colours.
            <br />
            <span className="serif-accent">Never your photo.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            UnNGL is a free, open source anonymous-message service. The sender’s profile photo is
            turned into a palette on their own phone, and only the palette is ever transmitted.
          </p>
        </div>
      </CollageHeader>

      {/* 2. the diagram: photo → palette → message */}
      <section className="mx-auto -mt-10 max-w-4xl px-4 sm:px-6">
        <div className="card p-6 sm:p-9">
          <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {/* in: the photo, on the sender's device */}
            <div className="text-center">
              <div className="mx-auto w-24 overflow-hidden rounded-2xl">
                <BlobCollage
                  blobs={[
                    { color: 'var(--color-sky)', left: -20, top: -20, size: 90, shape: 0 },
                    { color: 'var(--color-coral)', left: 40, top: 30, size: 80, shape: 2 },
                    { color: 'var(--color-amber)', left: 10, top: 60, size: 60, shape: 1 },
                  ]}
                />
                <div className="aspect-square w-full bg-sky" />
              </div>
              <p className="field-label mt-3">1 · A photo</p>
              <p className="text-xs text-ink-soft">Read in the browser, never uploaded</p>
            </div>

            <span aria-hidden className="hidden text-2xl text-ink-faint sm:block">
              →
            </span>

            {/* middle: the six colours, the only thing that travels */}
            <div className="text-center">
              {sample ? (
                <PaletteDots colors={sample.colors} className="mx-auto scale-125" />
              ) : null}
              <p className="field-label mt-3">2 · Six colours</p>
              <p className="text-xs text-ink-soft">The entire hint. That is all that is sent.</p>
            </div>

            <span aria-hidden className="hidden text-2xl text-ink-faint sm:block">
              →
            </span>

            {/* out: the message and the palette, together, for the recipient */}
            <div className="text-center">
              {sample ? (
                <PaletteBlobs colors={sample.colors} className="h-20 sm:h-24" />
              ) : null}
              <p className="field-label mt-3">3 · A message</p>
              <p className="text-xs text-ink-soft">“Do you recognise these colours?”</p>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center leading-relaxed text-ink-soft">
          The same photo always produces the same six colours. We publish the{' '}
          <Link
            href="/algorithm"
            className="font-semibold text-ink underline decoration-2 underline-offset-4"
          >
            algorithm in full
          </Link>{' '}
          — you can run it yourself and check that nobody is faking a palette.
        </p>
      </section>

      {/* 3. the three guarantees */}
      <section className="mx-auto mt-20 max-w-5xl px-4 sm:px-6">
        <h2 className="display-lg text-center">What we can’t do with your photo</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {GUARANTEES.map((g) => (
            <div
              key={g.title}
              className="rounded-3xl p-6"
              style={{ background: g.tint }}
            >
              <span
                className="block h-3 w-3 rounded-full"
                style={{ background: g.color }}
                aria-hidden
              />
              <h3 className="mt-4 text-lg leading-snug font-bold">{g.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{g.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. the two ways in */}
      <section className="mx-auto mt-20 max-w-2xl px-4 text-center sm:px-6">
        <h2 className="display-lg">Get your link</h2>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          Sign in with your email and we’ll make you an inbox. No password — we email you a code.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="btn btn-primary">
            Create my link
          </Link>
          <a href={GITHUB} className="btn btn-outline" rel="noreferrer noopener" target="_blank">
            Read the source
          </a>
        </div>
      </section>
    </div>
  );
}
