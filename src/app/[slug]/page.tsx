import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Composer } from '@/components/composer';
import { PaletteBars } from '@/components/palette-collage';
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
        <p className="stamp">yours</p>
        <h1 className="display-lg mt-4">This is your link.</h1>
        <p className="mt-3 max-w-prose leading-relaxed">
          You would be writing to yourself. Open your inbox to read what has come in.
        </p>
        <Link href={`/i/${inbox.slug}`} className="btn btn-punch mt-6">
          Open my inbox →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <Composer slug={inbox.slug} title={inbox.title} maxChars={config.limits.maxMessageChars} />

      <section className="mt-12">
        <h2 className="display-md">How the hint works</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {SAMPLE_LIST.slice(0, 3).map((p) => (
            <div key={p.hash} className="card p-3">
              <PaletteBars colors={p.colors} height={22} />
              <p className="mono-chip mt-2 break-all text-ink-soft">{p.colors.slice(0, 3).join(' ')}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-prose leading-relaxed">
          Attach a photo and we turn it into six colours — the same six colours, every
          time, computed by a{' '}
          <Link href="/algorithm" className="underline decoration-2 underline-offset-2">
            algorithm we published
          </Link>
          . The person receiving your message sees the colours, never the photo, and the
          photo is deleted once we have checked the colours.
        </p>
        <p className="mono-chip mt-4 text-ink-soft">
          this page is not indexed · nobody can see what you write before you send it
        </p>
      </section>
    </div>
  );
}
