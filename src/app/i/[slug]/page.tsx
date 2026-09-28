import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { MessagesPanel } from '@/components/messages-panel';
import { InboxSettings } from '@/components/inbox-settings';
import { currentUserId } from '@/lib/auth';
import { getInboxBySlug, listMessages, markAllSeen } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your inbox',
  robots: { index: false, follow: false, nocache: true },
};

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const inbox = getInboxBySlug(slug);
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

  const messages = listMessages(inbox.id);
  if (messages.some((m) => !m.seen)) markAllSeen(inbox.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="stamp">inbox</p>
        <h1 className="display-lg mt-4">{inbox.title}</h1>
        <p className="mt-2 text-ink-soft">
          {messages.length} message{messages.length === 1 ? '' : 's'} · every hint shown in full,
          nothing locked
        </p>
      </header>

      <MessagesPanel slug={inbox.slug} title={inbox.title} messages={messages} />

      <div className="mt-12">
        <InboxSettings
          slug={inbox.slug}
          title={inbox.title}
          notify={inbox.notify === 1}
        />
      </div>

      <p className="mt-10 text-center text-sm text-ink-soft">
        <Link href="/inbox" className="underline decoration-2 underline-offset-2">
          ← all your inboxes
        </Link>
      </p>
    </div>
  );
}
