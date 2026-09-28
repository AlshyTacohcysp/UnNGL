import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * Anonymous inboxes should never be crawled, logged by search engines, or
 * previewed by chat clients.
 *
 * Inbox links live at the root (`/<slug>`) and cannot be told apart from `/`
 * in a robots.txt path rule, so the primary defence is the `noindex` meta tag
 * that `/[slug]`, `/i/[slug]` and `/h/[token]` each emit. This file handles
 * the prefixes that *are* distinguishable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/algorithm', '/about', '/privacy', '/terms'],
        disallow: ['/api/', '/i/', '/h/', '/inbox', '/settings', '/login'],
      },
    ],
    sitemap: `${config.origin}/sitemap.xml`,
    host: config.origin,
  };
}
