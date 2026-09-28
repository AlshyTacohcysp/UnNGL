import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { MessagesPanel } from '@/components/messages-panel';
import { CollageHeader } from '@/components/blob-collage';
import { InboxSettings } from '@/components/inbox-settings';
import { currentUserId } from '@/lib/auth';
import { getInboxByHandleOrSlug, listMessages, markAllSeen } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your inbox',
  robots: { index: false, follow: false, nocache: true },
};

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const inbox = await getInboxByHandleOrSlug(slug);
  if (!inbox) notFound();

  const userId = await currentUserId();
  if (!userId) {
    redirect(`/login?redirect=${encodeURIComponent(`/i/${slug}`)}`);
  }
  if (inbox.owner_id !== userId) {
    // Same response as "does not exist" would be nicer, but the link itself is
    // the credential, so being explicit here costs nothing.
    notFound();
  }

  const messages = await listMessages(inbox.id);
  if (messages.some((m) => !m.seen)) await markAllSeen(inbox.id);

  return (
    <div className="pb-20">
      {/* The mockup's inbox header: a short band of blobs with the count
          sitting on it, then the cards begin. The collage here is deliberately
          smaller than the send page's — this screen is about reading. */}
      <CollageHeader className="px-4 pt-8 pb-14 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold text-ink">
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </p>
          <h1 className="display-lg mt-2">Your messages</h1>
        </div>
      </CollageHeader>

      <div className="mx-auto -mt-9 max-w-3xl px-4 sm:px-6">

      <MessagesPanel slug={inbox.slug} title={inbox.title} messages={messages} />

      <div className="mt-12">
        <InboxSettings
          slug={inbox.slug}
          inboxId={inbox.id}
          handle={inbox.handle}
          title={inbox.title}
          notify={inbox.notify === 1}
        />
      </div>

        <p className="mt-10 text-center text-sm text-ink-soft">
          <Link href="/inbox" className="font-semibold text-ink underline decoration-2 underline-offset-4">
            ← all your inboxes
          </Link>
        </p>
      </div>
    </div>
  );
}
