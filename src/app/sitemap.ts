import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * Only the marketing pages are indexable. Every inbox link is `noindex` at the
 * page level — this sitemap simply never mentions one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${config.origin}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${config.origin}/algorithm`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${config.origin}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${config.origin}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${config.origin}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
