import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ClaimForm } from '@/components/claim-form';
import { findMessageByClaim, getInboxById } from '@/lib/inbox';
import { getHintForMessage, toHintView } from '@/lib/hints';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your private link',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const message = await findMessageByClaim(token);
  if (!message) notFound();

  const inbox = await getInboxById(message.inbox_id);
  const hint = await getHintForMessage(message.id);
  const view = hint ? toHintView(hint) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <p className="pill pill-outline">private</p>
      <h1 className="display-lg mt-4">This link is yours.</h1>
      <p className="mt-3 max-w-prose leading-relaxed">
        It’s the only key to the message you sent{inbox ? ` to “${inbox.title}”` : ''}. Nobody
        else has it, and it reveals nothing on its own — it only lets you attach or change
        your colour hint.
      </p>

      <div className="mt-8">
        <ClaimForm token={token} existing={Boolean(view)} />
      </div>

      {view && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          Right now your hint is the six colours shown above.
        </p>
      )}

      <p className="mt-10 text-center text-sm">
        <Link href="/" className="underline decoration-2 underline-offset-2">
          ← about UnNGL
        </Link>
      </p>
    </div>
  );
}
