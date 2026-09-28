import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { InboxDashboard } from '@/components/inbox-dashboard';
import { currentUser } from '@/lib/auth';
import { listInboxesForUser } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your inboxes',
  robots: { index: false, follow: false },
};

export default async function InboxListPage() {
  const user = await currentUser();
  if (!user) redirect('/login?redirect=%2Finbox');

  const inboxes = (await listInboxesForUser(user.id)).map((i) => ({
    slug: i.slug,
    handle: i.handle,
    title: i.title,
    createdAt: i.created_at,
    lastMessageAt: i.last_message_at,
    total: i.total,
    unread: i.unread,
    lastBody: i.last_body,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="pill pill-outline">your links</p>
        <h1 className="display-lg mt-4">Inboxes</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-ink-soft">
          Each one is a link you can hand out. Whoever has the link can write to you, and
          whoever has the link can read what is written — so rotate a link if it leaks.
        </p>
      </header>

      <InboxDashboard inboxes={inboxes} />

      <p className="mt-10 text-center text-sm text-ink-soft">
        <Link href="/" className="underline decoration-2 underline-offset-2">
          ← about UnNGL
        </Link>
      </p>
    </div>
  );
}
