# 个人博客 · 项目约定（AGENTS.md）

> 本文件会被 AI 编码助手在每次会话自动加载。**开启新会话时，先读完本文件与 [`rules.md`](./rules.md) 再动手。**
>
> 当前状态：**阶段 3 已完成（搜索 / RSS / SEO）+ 内容管理后台（Sveltia CMS）已接入** —— 下一步阶段 4：部署到 Cloudflare Pages（需要 GitHub 仓库地址）。

---

## 一、项目定位

中文个人博客（技术笔记 + 生活记录）。纯静态站点，托管在 Cloudflare Pages 免费额度内，**零月费**。

内容以 Markdown 文件形式存放在仓库里，Git 即 CMS。写文章有两种方式：本地编辑 `.md` 后推送，或打开 `/admin/` 用后台界面直接编辑并提交。

---

## 二、技术栈（版本锁定）

| 层 | 选型 | 版本 | 说明 |
| --- | --- | --- | --- |
| 框架 | Astro（SSG） | 7.4.1 | `output: 'static'`，不启用 SSR |
| 样式 | Tailwind CSS | 4.3.3 | 经 `@tailwindcss/vite` 插件接入（非 `@astrojs/tailwind`） |
| 排版 | @tailwindcss/typography | 0.5.20 | 提供 `prose` 类美化 Markdown 正文 |
| 搜索 | astro-pagefind / Pagefind | 2.0.1 / 1.5.2 | 构建时生成静态索引，运行时零后端 |
| RSS | @astrojs/rss | 4.0.19 | 输出 `/rss.xml` |
| Sitemap | @astrojs/sitemap | 3.7.4 | 输出 `/sitemap-index.xml` |
| 评论 | Giscus | 原生 script | 基于 GitHub Discussions，无服务器 |
| 后台 | @sveltia/cms | 0.248.1 | 静态页面 + 令牌登录，直连 GitHub 仓库，无后端 |
| 托管 | Cloudflare Pages | — | Git 集成，免费 `*.pages.dev` 子域 |

升级任何依赖前先说明理由。Astro 主版本升级（如 v7 → v8）必须单独评估破坏性变更，不在日常改动里顺带升级。

---

## 三、核心规则（优先级最高）

> 这五条与具体技术无关，管的是「怎么干活」。与下文技术约束冲突时，**以本节为准**。

### R1 破坏性操作须先获批

任何删除、覆盖、移动文件或目录的动作，**先说明要删什么、为什么删，得到明确同意后再执行**。

- **工作区之外**：删除必须先获得明确同意；能移动就不要彻底删除，优先移到备份位置。
- 工作区内**可再生成的产物**（`dist/`、`.astro/`、`node_modules/`）可清理，但须在回执中列明清除了什么。
- 「删除」涵盖：`rm`、`rmdir`、`git clean`、`git reset --hard`、覆盖写同名文件、清空目录内容。

### R2 环境变更须先获批

安装或卸载依赖、修改全局配置（`~/.dsh`、shell profile、系统 PATH）、改动 Cloudflare / GitHub 等平台设置、新增构建环境变量——**先说明改什么、为什么改，得到同意再动手**。

- 读取配置、查看版本、查询状态**不需要**批准。
- 为排查问题而运行的一次性临时命令**不需要**批准。

### R3 先复用，再自造

实现任何非平凡功能前，**先搜索 GitHub / npm / Astro 官方生态**是否已有成熟方案（有维护、有文档、许可证兼容）。

- 找到候选时，说明「选它 / 不选它」的理由，再动手。
- 引入第三方依赖前核对许可证与最近维护时间。
- 若依赖或资源**下载缓慢 / 失败**（网络受限），**不要反复重试或悄悄换镜像**，直接请用户协助下载或代为提供文件。

### R4 模块边界清晰、接口通信、内部黑箱

- 每个模块只暴露**最小公共接口**，外部不得触碰其内部实现。
- 模块间通过**明确契约**通信：组件用 props 与插槽，工具函数用带类型的签名，跨进程用 HTTP 端点。
- **替换一个模块的内部实现时，不应要求改动调用方**。
- 新增能力优先以「新增模块 + 接线」落地，而不是往已有模块里堆条件分支。
- 本项目落地方式：**数据获取只发生在本页面层**，组件只吃 props、不直接读文件系统；搜索、评论、统计均为**可插拔模块**，关掉任意一个不影响其余功能。

### R5 每完成一个工作块就提交

- 每个**可独立验证的工作块**（一个阶段、一个模块、一次修复）完成且验证通过后，**立即提交**：`git add` → `git commit`，**不攒大堆改动一次性提交**。
- 提交信息遵循 Conventional Commits（见 `rules.md` 第 9 节），type 用英文、描述可中文。
- **阶段边界必须留一个干净提交**，保证任何阶段都能单独回滚。
- 远程仓库就绪后，每个阶段结束推送一次，作为异地备份。
- 首次提交前若 `user.name` / `user.email` 未配置，**先询问用户**，不要擅自写全局 git 配置（受 R2 约束）。

**与 R1 的边界**：

| 操作 | 是否需要额外同意 |
| --- | --- |
| `git init` / `add` / `commit` / `log` / `status` / `diff` / `push` | 不需要 |
| `git reset --hard` / `git clean` / `git checkout -- .` | **需要**（会丢失改动） |
| `git rebase` 改写历史 / `push --force` | **需要** |

---

## 四、硬约束（违反会直接坏站）

按编号引用，评审时可直接说「违反 C3」。

- **C1 运行版本**：Node 必须 **≥ 22.22.0**（Astro 7 硬性要求）。Cloudflare Pages 构建必须显式设置 `NODE_VERSION=24` 与 `PNPM_VERSION=12`——该平台默认 Node 为 22.16.0，低于下限，不设必构建失败。
- **C2 Markdown 管线**：Astro 7 默认使用 **Sätteri**，且不再默认安装 `@astrojs/markdown-remark`。**禁止直接照抄网上 remark/rehype 插件教程**。确需插件时：先装 `@astrojs/markdown-remark`，再在 `astro.config.mjs` 设 `markdown.processor: unified()`。
- **C3 zod 导入路径**：内容集合 schema 里的 `z` 来自 **`astro/zod`**，不是 `astro:content`。
- **C4 字体**：禁止 Google Fonts 及任何境外字体 CDN，只使用系统字体栈（大陆访问速度与隐私双重原因）。
- **C5 图片**：一律走 Astro `<Image />` 构建时优化；单图 **< 1 MB**；不使用外链图床。
- **C6 内容过滤**：所有文章列表、标签页、归档、RSS、sitemap **必须**过滤掉 `draft: true` 与 `pubDate` 在未来的条目。该逻辑抽成**一个共用函数**，禁止各处重复实现。
- **C7 语言**：站点 `lang="zh-CN"`，单语种，不引入 i18n 框架。

---

## 五、目录职责

```
src/
  components/    可复用 .astro 组件（PascalCase）
  content/blog/  Markdown 文章，唯一内容来源
  layouts/       页面骨架；BaseLayout 承载 SEO 与主题切换
  pages/         路由，遵循 Astro 文件路由约定
  pages/admin/   内容管理后台（Sveltia CMS），不索引、不进 sitemap
  lib/           数据访问层（文章过滤、标签聚合、日期格式化等纯函数）
  styles/        全局 CSS（Tailwind 入口与主题变量）
  consts.ts      站点名、SITE_URL、GISCUS 等常量
docs/            流程与协作文档
public/          原样拷贝的静态资源（favicon）
public/admin/    后台配置 config.yml
```

数据获取统一走 `src/lib/posts.ts`，组件只接收 props。

新增顶层目录前先说明理由。不要为「以后可能用到」提前建空目录或空文件。

---

## 六、常用命令

```bash
pnpm dev       # 本地开发（默认 http://localhost:4321）
pnpm build     # 构建静态站 + 生成 pagefind 搜索索引
pnpm preview   # 预览 dist/ 构建产物
pnpm check     # astro check 类型检查
```

---

## 七、改动后必须验证（每次提交前）

1. `pnpm check` 通过
2. `pnpm build` 通过，且 `dist/` 内存在：`index.html`、`rss.xml`、`sitemap-index.xml`、`pagefind/`
3. `pnpm preview` 抽查四个页面：首页、任一文章页、任一标签页、`/search`
4. 若改动了内容或过滤逻辑，确认草稿**没有**出现在任何产物与列表中

---

## 八、禁区

- 不引入 React / Vue / Svelte 等 UI 框架（当前无 hydration 需求）
- 不改成 SSR，不启用 `@astrojs/cloudflare` adapter（纯静态已足够）
- 不引入数据库、KV、D1（内容就是 Git 里的文件）
- 不提交任何密钥、token 或账号凭据
- 不在组件里硬编码站点 URL，一律走 `consts.ts` 的 `SITE_URL`
- 不擅自修改 `package.json` 中锁定的版本号

---

## 九、细则

编码、内容、样式、SEO、性能等**可逐条判断的规则**见 [`rules.md`](./rules.md)。提交前请过一遍其中的「第 10 节 Review 自查表」。
