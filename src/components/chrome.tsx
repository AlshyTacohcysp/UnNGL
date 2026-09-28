import Link from 'next/link';
import { BrandDots } from './palette-strip';

/**
 * Site chrome. Server component: the nav knows whether you're signed in.
 *
 * The mockup has no site-wide bar — the wordmark is a floating pill that sits
 * on the collage of whichever screen you are on. This bar is what every other
 * page gets, so it stays quiet: no rule under it, no hard edge.
 *
 * @license AGPL-3.0-or-later
 */

export function Nav({ user }: { user: { email: string | null; display_name: string | null } | null }) {
  const label = user ? (user.display_name ?? user.email ?? 'You') : null;
  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="pill group">
          <BrandDots />
          <span className="text-[0.95rem] font-bold tracking-tight text-ink">UnNGL</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1.5 text-sm">
          <Link href="/about" className="hidden px-2.5 py-1.5 text-ink-soft hover:text-ink sm:block">
            How it works
          </Link>
          <Link href="/algorithm" className="hidden px-2.5 py-1.5 text-ink-soft hover:text-ink sm:block">
            Algorithm
          </Link>
          {user ? (
            <>
              <Link href="/inbox" className="btn btn-sm btn-primary">
                Your inboxes
              </Link>
              <Link
                href="/settings"
                className="hidden max-w-[12rem] truncate px-2.5 py-1.5 text-ink-soft hover:text-ink sm:block"
                title={label ?? undefined}
              >
                {label}
              </Link>
            </>
          ) : (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const link = 'text-ink-soft underline decoration-line decoration-2 underline-offset-4 hover:text-ink';
  return (
    <footer className="mt-24 bg-canvas">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <span className="pill">
            <BrandDots />
            <span className="font-bold tracking-tight text-ink">UnNGL</span>
          </span>
          <p className="serif-accent mt-3 text-2xl text-ink">the free one.</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
            Anonymous messages with a colour hint instead of a paid “reveal”. No data sold, no
            paywall, algorithm published in full.
          </p>
        </div>
        <div className="text-sm">
          <p className="label">Product</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/algorithm" className={link}>
                Palette algorithm
              </Link>
            </li>
            <li>
              <Link href="/about" className={link}>
                How it works
              </Link>
            </li>
            <li>
              <Link href="/login" className={link}>
                Sign in
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="label">Legal &amp; source</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/privacy" className={link}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={link}>
                Terms
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/AlshyTacohcysp/UnNGL"
                className={link}
                rel="noreferrer noopener"
                target="_blank"
              >
                Source (AGPL)
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="px-4 pb-10 text-center sm:px-6">
        <p className="text-xs text-ink-faint">
          Free software, public source. No data is ever sold.
        </p>
      </div>
    </footer>
  );
}
