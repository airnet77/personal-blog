import type { APIContext } from 'astro';
import rss from '@astrojs/rss';

import { getPublishedPosts } from '../lib/posts';
import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL } from '../consts';

export async function GET(_context: APIContext) {
  const posts = await getPublishedPosts();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: SITE_URL,
    // 只输出最近 20 篇，且已由 getPublishedPosts 过滤草稿与未来文章
    items: posts.slice(0, 20).map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id}/`,
    })),
    customData: '<language>zh-cn</language>',
  });
}
