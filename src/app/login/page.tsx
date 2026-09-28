import type { Metadata } from 'next';
import { LoginForm } from '@/components/login-form';
import { listProviders } from '@/lib/oauth';
import { config } from '@/lib/config';
import { safeRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to UnNGL with a one-time email code, or an OAuth provider.',
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);

  const providers = listProviders().map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.configured,
    note: p.note,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      <LoginForm
        providers={providers}
        redirectTo={safeRedirectPath(one('redirect'))}
        devMode={!config.isProd && config.mail.transport === 'console'}
        notice={one('error') ? `Sign-in failed: ${one('error')}` : undefined}
        initialEmail={one('email')}
        initialCode={/^\d{6}$/.test(one('code') ?? '') ? one('code') : undefined}
      />
    </div>
  );
}
