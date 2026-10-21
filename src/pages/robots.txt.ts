import type { APIContext } from 'astro';

import { SITE_URL } from '../consts';

export function GET(_context: APIContext) {
  const sitemap = new URL('sitemap-index.xml', SITE_URL).href;

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
