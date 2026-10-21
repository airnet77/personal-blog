import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import pagefind from 'astro-pagefind';

import { SITE_URL } from './src/consts.ts';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  output: 'static',

  // 开发调试工具栏挪到右下角，避免挡住页面底部内容。
  // 注意：这只在本地 `pnpm dev` 时出现，线上访客看不到。
  devToolbar: {
    placement: 'bottom-right',
  },

  integrations: [
    // 搜索页、404 页与后台管理页不进 sitemap
    sitemap({
      filter: (page) =>
        !page.includes('/404') && !page.includes('/search') && !page.includes('/admin'),
    }),
    // 构建结束后自动为 dist/ 生成 Pagefind 搜索索引
    pagefind(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
});
