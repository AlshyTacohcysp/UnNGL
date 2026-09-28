import type { Metadata, Viewport } from 'next';
import { Footer, Nav } from '@/components/chrome';
import { currentUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { ALGORITHM_VERSION } from '@/lib/palette/extract';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(config.origin),
  title: {
    default: 'UnNGL — anonymous messages, free colour hints',
    template: '%s · UnNGL',
  },
  description:
    'Free, open source anonymous messages. The hint is the sender’s whole colour palette — never their face. No paywall, no data sold, algorithm published in full.',
  applicationName: 'UnNGL',
  keywords: ['anonymous messages', 'free alternative to NGL', 'palette', 'open source', 'privacy'],
  authors: [{ name: 'UnNGL contributors' }],
  openGraph: {
    type: 'website',
    siteName: 'UnNGL',
    title: 'UnNGL — anonymous messages, free colour hints',
    description:
      'The hint is the sender’s whole colour palette. Free, open source, and the algorithm is published.',
  },
  twitter: { card: 'summary_large_image' },
  // No `robots` here on purpose: "index, follow" is the default, and stating it in
  // the root layout produced a second robots meta tag on every page that sets its
  // own (e.g. inboxes and claim links, which are noindex). Pages opt in or out
  // individually; silence at the root means one tag, never two.
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#f6f1e6',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        {/*
          Skip link. The design is deliberately loud — big nav, collage cards,
          hard shadows — which is exactly the kind of page a keyboard user does
          not want to tab through in full on every page. Off-screen until focused,
          and the focus ring is already global, so it looks like everything else.
        */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Nav user={user ? { email: user.email, display_name: user.display_name } : null} />
        <main id="main" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <Footer />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'UnNGL',
              applicationCategory: 'SocialApplication',
              operatingSystem: 'Any',
              license: 'https://www.gnu.org/licenses/agpl-3.0.html',
              description:
                'Anonymous messages with a free colour-palette hint instead of a paid reveal.',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              isAccessibleForFree: true,
              featureList: [`palette algorithm v${ALGORITHM_VERSION}`],
            }),
          }}
        />
      </body>
    </html>
  );
}
