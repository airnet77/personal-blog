import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/**
 * 取所有「可发布」的文章，按发布日期倒序。
 *
 * 这是全站唯一的过滤入口（AGENTS.md C6）：
 * 草稿与未来日期的文章在这里被拦下，任何页面都不要自己再写一遍过滤逻辑。
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const now = Date.now();
  const posts = await getCollection('blog', ({ data }) => {
    return !data.draft && data.pubDate.getTime() <= now;
  });

  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

/** 标签及出现次数，按次数倒序 */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const posts = await getPublishedPosts();
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

/** 按标签筛选文章 */
export async function getPostsByTag(tag: string): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.filter((post) => post.data.tags.includes(tag));
}

/** 按年份分组，用于归档页 */
export function groupByYear(posts: Post[]): { year: string; posts: Post[] }[] {
  const map = new Map<string, Post[]>();

  for (const post of posts) {
    const year = String(post.data.pubDate.getFullYear());
    const list = map.get(year);
    if (list) {
      list.push(post);
    } else {
      map.set(year, [post]);
    }
  }

  return [...map.entries()]
    .map(([year, list]) => ({ year, posts: list }))
    .sort((a, b) => Number(b.year) - Number(a.year));
}

/** 粗略估算阅读时间（中文约 400 字/分钟） */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const chars = body.replace(/\s/g, '').length;
  return Math.max(1, Math.round(chars / 400));
}

/** 日期格式化为 YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
