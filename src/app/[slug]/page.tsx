import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Composer } from '@/components/composer';
import { CollageHeader } from '@/components/blob-collage';
import { PaletteBlobs } from '@/components/palette-strip';
import { currentUserId } from '@/lib/auth';
import { config } from '@/lib/config';
import { getInboxBySlug } from '@/lib/inbox';
import { SAMPLE_LIST } from '@/lib/samples.generated';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** Inbox links are private by nature: never index them, never cache them. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const inbox = await getInboxBySlug(slug);
  return {
    title: inbox ? `A message for ${inbox.title}` : 'Message',
    description: 'Send an anonymous message, with your colours as the hint.',
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function ComposePage({ params }: Params) {
  const { slug } = await params;
  const inbox = await getInboxBySlug(slug);
  if (!inbox) notFound();

  // If this is the owner on their own link, show them their messages instead
  // of a composer addressed to themselves.
  const userId = await currentUserId();
  if (userId && inbox.owner_id === userId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <span className="pill">Yours</span>
        <h1 className="display-lg mt-4">This is your link.</h1>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
          You would be writing to yourself. Open your inbox to read what has come in.
        </p>
        <Link href={`/i/${inbox.slug}`} className="btn btn-primary mt-6">
          Open my inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Collage header, cropped at the top so the shapes bleed off-screen. */}
      <CollageHeader className="px-4 pt-8 pb-24 sm:px-6 sm:pt-10">
        <div className="mx-auto max-w-2xl">
          <span className="pill">
            <span className="dot-row">
              <i style={{ background: 'var(--color-amber)' }} />
              <i style={{ background: 'var(--color-coral)' }} />
              <i style={{ background: 'var(--color-teal)' }} />
              <i style={{ background: 'var(--color-indigo)' }} />
            </span>
            <span className="font-bold tracking-tight text-ink">UnNGL</span>
          </span>
        </div>
      </CollageHeader>

      {/* The card rides up over the blobs — the overlap is the composition. */}
      <div className="mx-auto -mt-16 max-w-2xl px-4 sm:px-6">
        <Composer slug={inbox.slug} title={inbox.title} maxChars={config.limits.maxMessageChars} />

        {/* Instagram: the mockup's second action, and the cheapest way for a
            sender to get a palette — the photo is already on their profile. */}
        <div className="card mt-4 flex flex-wrap items-center gap-3 p-5">
          <div className="min-w-[12rem] flex-1">
            <p className="font-semibold text-ink">Send straight from Instagram</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              Pull your profile photo, take the {config.limits.maxMessageChars > 0 ? 6 : 6} colours
              from it, and forget the photo.
            </p>
          </div>
          <a href={`/api/oauth/instagram?next=${encodeURIComponent(`/u/${inbox.slug}`)}`} className="btn btn-outline">
            Connect Instagram
          </a>
        </div>

        {/* The promise, restated with three examples from real photographs. */}
        <section className="mt-16">
          <h2 className="display-md">Your colours travel. Your photo doesn’t.</h2>
          <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
            We read six colours from a photo and keep the colours. The photo is checked against
            them, then deleted — it is never stored on the message, never sent to the person
            receiving it, and never visible to us for longer than the seconds it takes to read it.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {SAMPLE_LIST.slice(0, 3).map((p) => (
              <div key={p.hash} className="card p-3">
                <PaletteBlobs colors={p.colors} className="h-20" />
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            The same photo always gives the same six colours, computed by a{' '}
            <Link href="/algorithm" className="font-semibold text-ink underline decoration-2 underline-offset-4">
              algorithm we published in full
            </Link>
            .
          </p>
        </section>

        <p className="mt-10 text-center text-xs text-ink-faint">
          This page is never indexed. Nobody can see what you write before you send it.
        </p>
      </div>
    </div>
  );
}
