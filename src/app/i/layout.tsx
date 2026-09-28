import type { Metadata } from 'next';

/**
 * Inbox pages are private: anyone with the link can read them, so they must
 * never end up in a search index or a browser cache.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return children;
}
