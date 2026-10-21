/**
 * 站点全局常量。
 * 修改站点名称、简介、作者、地址时只改这里，不要散落在组件里。
 */

export const SITE_TITLE = '我的博客';
export const SITE_DESCRIPTION = '记录技术与生活';
export const SITE_AUTHOR = '博主';
export const SITE_LANG = 'zh-CN';

/**
 * 站点地址（影响 sitemap、RSS、canonical 的绝对链接）。
 * 部署到 Cloudflare Pages 拿到正式域名后改成真实地址，再推一版。
 * 注意：结尾不要带斜杠。
 */
export const SITE_URL = 'https://airnet-blog.pages.dev';

/** 页头导航。顺序即显示顺序 */
export const NAV_LINKS = [
  { label: '首页', href: '/' },
  { label: '文章', href: '/blog/' },
  { label: '标签', href: '/tags/' },
  { label: '归档', href: '/archive/' },
  { label: '搜索', href: '/search/' },
  { label: '关于', href: '/about/' },
];

/** 社交链接。没有就留空数组 */
export const SOCIAL_LINKS: { label: string; href: string }[] = [];

/**
 * 评论（Giscus）配置。
 *
 * 暂未启用。等配好 GitHub 仓库的 Discussions 后：
 * 1. 到 https://giscus.app/zh-CN 填入仓库名，生成参数
 * 2. 把 enabled 改为 true，并填上 repo / repoId / categoryId
 * 3. 重新构建部署即可，无需改动其他代码
 */
export const GISCUS = {
  enabled: false,
  repo: '',
  repoId: '',
  category: 'Comments',
  categoryId: '',
  /** 评论主题，跟随站点的明暗模式 */
  theme: {
    light: 'light',
    dark: 'dark',
  },
  mapping: 'pathname',
  reactionsEnabled: '1',
  inputPosition: 'top',
  lang: 'zh-CN',
};

