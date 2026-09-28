import Link from 'next/link';

/**
 * Site chrome. Server component: the nav knows whether you're signed in.
 *
 * @license AGPL-3.0-or-later
 */

export function Nav({ user }: { user: { email: string | null; display_name: string | null } | null }) {
  const label = user ? (user.display_name ?? user.email ?? 'You') : null;
  return (
    <header className="border-b-[2.5px] border-ink bg-paper sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 shrink-0">
          <span className="relative inline-block">
            <span className="grid grid-cols-3 gap-[2px] border-[2.5px] border-ink p-[2px] bg-paper shadow-hard-sm group-hover:translate-x-[1px] group-hover:-translate-y-[1px] transition-transform">
              <i className="block h-2.5 w-2.5 bg-punch" />
              <i className="block h-2.5 w-2.5 bg-acid" />
              <i className="block h-2.5 w-2.5 bg-sky" />
              <i className="block h-2.5 w-2.5 bg-grape" />
              <i className="block h-2.5 w-2.5 bg-sun" />
              <i className="block h-2.5 w-2.5 bg-mint" />
            </span>
          </span>
          <span className="text-xl font-extrabold tracking-tight">UnNGL</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2 text-sm">
          <Link href="/algorithm" className="hidden px-2 py-1.5 hover:bg-paper-2 sm:block">
            Algorithm
          </Link>
          <Link href="/about" className="hidden px-2 py-1.5 hover:bg-paper-2 sm:block">
            About
          </Link>
          {user ? (
            <>
              <Link href="/inbox" className="btn btn-sm btn-ink">
                Your inboxes
              </Link>
              <Link href="/settings" className="px-2 py-1.5 hover:bg-paper-2" title={label ?? undefined}>
                {label}
              </Link>
            </>
          ) : (
            <Link href="/login" className="btn btn-sm btn-ink">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t-[2.5px] border-ink bg-paper-2">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-2xl font-extrabold tracking-tight">UnNGL</p>
          <p className="serif-accent mt-1 text-xl">the free one.</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
            Anonymous messages with a colour hint instead of a paid “reveal”. No data sold, no
            paywall, algorithm published in full.
          </p>
        </div>
        <div className="text-sm">
          <p className="label">Product</p>
          <ul className="flex flex-col gap-1.5">
            <li>
              <Link href="/algorithm" className="underline decoration-2 underline-offset-2">
                Palette algorithm
              </Link>
            </li>
            <li>
              <Link href="/about" className="underline decoration-2 underline-offset-2">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/login" className="underline decoration-2 underline-offset-2">
                Sign in
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="label">Legal &amp; source</p>
          <ul className="flex flex-col gap-1.5">
            <li>
              <Link href="/privacy" className="underline decoration-2 underline-offset-2">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="underline decoration-2 underline-offset-2">
                Terms
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/AlshyTacohcysp/UnNGL"
                className="underline decoration-2 underline-offset-2"
                rel="noreferrer noopener"
                target="_blank"
              >
                Source (AGPL)
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t-[2.5px] border-ink px-4 py-4 text-center sm:px-6">
        <p className="mono-chip text-ink-soft">
          Not affiliated with NGL · AGPL-3.0 · run it yourself
        </p>
      </div>
    </footer>
  );
}
