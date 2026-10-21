# 个人博客

基于 Astro 的静态博客，托管在 Cloudflare Pages，**零月费、零服务器维护**。

- **在线地址**：<https://airnet-blog.pages.dev>
- **管理后台**：<https://airnet-blog.pages.dev/admin>

## 特性

- **纯静态**：全球 CDN 加速，访问快、成本为零
- **网页后台**：浏览器里写文章，不需要本地环境
- **自动部署**：保存后约 1–2 分钟自动上线（GitHub Actions）
- **全文搜索**：Pagefind 构建时生成索引，运行时零后端
- **自建评论**：无需登录、支持 Markdown；七类违禁词 + AI 审核 + 每日配额 + 自动封禁，全部参数在后台调
- **内容即文件**：Markdown 存在本仓库，Git 就是内容管理系统
- **SEO 就绪**：RSS、sitemap、canonical、BlogPosting 结构化数据
- **明暗主题**：跟随系统，可手动切换并记住选择
- **响应式**：手机、平板、桌面均可用

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Astro 7（`output: 'static'`） |
| 样式 | Tailwind CSS 4 + `@tailwindcss/typography` |
| 搜索 | Pagefind 1.5（构建时索引） |
| 评论 | 自建（Pages Functions + GitHub 文件），AI 审核可插拔 |
| 后台 | 自研 WebUI + Cloudflare Pages Functions |
| 认证 | HMAC 签名 Cookie + 环境变量密码 |
| 部署 | Cloudflare Pages + GitHub Actions |
| 内容 | Markdown 文件存于本仓库 |

## 快速开始

```bash
pnpm install
pnpm dev          # 打开 http://localhost:4321
```

需要 Node ≥ 22.22（项目 `.node-version` 指定 24）与 pnpm 12。

## 写文章

### 方式一：网页后台（推荐）

1. 打开 <https://airnet-blog.pages.dev/admin>
2. 输入管理密码
3. 新建或选择文章 → 编辑 → 点「保存」
4. 约 1–2 分钟后线上自动更新

支持：标题、摘要、日期、标签、草稿开关、Markdown 实时预览、图片上传。

### 方式二：本地编辑

在 `src/content/blog/` 下新建 `.md` 文件，推送后自动部署：

```markdown
---
title: '文章标题'
description: '一两句摘要，显示在列表页与搜索结果里'
pubDate: 2026-10-21
tags: ['Astro', '前端']
draft: false
---

正文用 Markdown 书写。
```

## 文章字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `description` | 是 | 摘要，建议 50–160 字 |
| `pubDate` | 是 | 发布日期，格式 `YYYY-MM-DD` |
| `updatedDate` | 否 | 更新日期 |
| `tags` | 否 | 标签数组，如 `['Astro', '前端']` |
| `draft` | 否 | `true` 时为草稿，不出现在任何页面、RSS、搜索中 |
| `cover` | 否 | 封面图路径 |

## 评论

文章页底部是自建评论区：读者不用登录，支持基础 Markdown（加粗、列表、代码块），**不允许链接、图片、HTML**。

提交时会依次经过：

1. **封禁 / 配额**：每台设备每天默认 50 条，每分钟 5 条；同一 IP 每天 100 条
2. **违禁词**：涉政（一刀切）/ 色情 / 赌博 / 毒品 / 血腥暴力 / 违法犯罪 / 广告引流，命中直接拒绝
3. **只许文字**：链接、图片、HTML、裸 URL、控制字符一律拦下
4. **本地规则**：刷屏、纯符号、重复短语
5. **AI 审核**：正常 / 拿不准（转人工）/ 违规（拒绝并隐藏）

四种状态：`visible` 展示、`pending` 等人工、`rejected` 违规（前台永不显示，后台留档）、`hidden` 手动隐藏。

后台 → **评论设置** 调参数，**违禁词** 维护词表，**用户管理** 看设备档案与封禁，**评论管理** 处理待审与违规。

> AI 审核靠三个环境变量接入，不配也能用（自动降级为「本地规则 + 转人工」）：
> `AI_PROVIDER`（`openai` / `cloudflare`）、`AI_BASE_URL`、`AI_API_KEY`。当前用 **DeepSeek `deepseek-flash`**，模型名可在后台改。

## 图片

放到 `src/assets/blog/` 目录，正文里用相对路径引用：

```markdown
![图片说明](../../assets/blog/你的图片.png)
```

构建时会自动压缩并转成 WebP（测试中 22 KB → 8 KB）。

## 构建与部署

```bash
pnpm check        # 类型检查
pnpm build        # 生成 dist/（含 Pagefind 索引）
pnpm preview      # 本地预览构建结果
```

推送到 `main` 分支后，GitHub Actions 会自动构建并部署到 Cloudflare Pages。

手动部署（备用方案）：

```bash
npx wrangler pages deploy dist --project-name airnet-blog
```

## 目录结构

```
src/
  components/    可复用组件（Header、PostCard、Comments 等）
  content/blog/  Markdown 文章（唯一内容来源）
  layouts/       BaseLayout 承载 SEO 与主题切换
  lib/posts.ts   数据访问层（草稿过滤、标签聚合、日期格式化）
  pages/         路由（含 admin/ 后台页面）
  styles/        全局样式
  consts.ts      站点名、SITE_URL、导航等常量
comments/        评论数据（每篇文章一个 JSON，另有配置 / 词表 / 台账）
functions/       Pages Functions（/api/*）
  api/           登录、文章 CRUD、图片上传、评论、健康检查、admin/*
  lib/           认证、GitHub API、frontmatter、评论存储与审核链（11 个模块）
public/          静态资源（favicon、后台样式、_headers）
.github/         GitHub Actions 工作流
docs/            协作文档与运维手册
```

## 相关文档

- [AGENTS.md](./AGENTS.md) —— 技术栈、硬约束、禁区（AI 协作必读）
- [rules.md](./rules.md) —— 编码、内容、服务端安全细则
- [docs/maintenance.md](./docs/maintenance.md) —— 运维手册：环境变量、故障排查、备份
- [docs/implementation-flow.md](./docs/implementation-flow.md) —— 本项目的实施过程记录
