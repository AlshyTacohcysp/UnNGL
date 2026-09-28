import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { SettingsForm } from '@/components/settings-form';
import { currentUser } from '@/lib/auth';
import { inboxCountForUser } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect('/login?redirect=%2Fsettings');

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="stamp">account</p>
        <h1 className="display-lg mt-4">Settings</h1>
      </header>

      <SettingsForm
        initialDisplayName={user.display_name}
        email={user.email}
        verified={Boolean(user.email_verified_at)}
        palette={user.avatar_palette ? JSON.parse(user.avatar_palette) : null}
        inboxCount={await inboxCountForUser(user.id)}
      />

      <p className="mt-10 text-center text-sm">
        <Link href="/inbox" className="underline decoration-2 underline-offset-2">
          ← your inboxes
        </Link>
      </p>
    </div>
  );
}
