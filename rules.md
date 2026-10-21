# 编码与内容规则（rules.md）

> 配合 [`AGENTS.md`](./AGENTS.md) 使用。`AGENTS.md` 讲「什么不能碰」，本文件讲「具体怎么写」。
> 每条规则都写成**可判断真假**的句子，便于评审时直接打勾。
>
> 标记说明：**[CI]** 可用脚本或命令检查 · **[Review]** 靠人工审查 · **[Agent]** 由 AI 会话遵守

---

## 1. 命名与文件组织

- [Agent] 文章文件名用英文或拼音的 kebab-case，如 `astro-tailwind-setup.md`。**不用中文文件名**，避免 URL 编码与跨平台问题。
- [Review] Astro 组件文件用 PascalCase，如 `PostCard.astro`。
- [Review] 工具函数与变量用 camelCase；不变量常量用 UPPER_SNAKE_CASE。
- [Review] 一个组件一个文件；单文件超过 200 行时考虑拆分。
- [Agent] 页面路由遵循 Astro 约定：`[...slug].astro`、`[tag].astro`，不自造路由表。

---

## 2. TypeScript

- [CI] `tsconfig.json` 继承 `astro/tsconfigs/strict`。
- [Review] 禁止 `any`；类型不确定时用 `unknown` 再收窄。
- [Agent] 文章类型从 `CollectionEntry<'blog'>` 推导，不手写重复的 interface。
- [Review] 组件 props 必须显式声明 `interface Props`。

---

## 3. Astro 组件

- [Review] frontmatter（两条 `---` 之间）只放数据整理与计算，不写副作用代码；**数据获取在页面层完成**，组件通过 props 接收（对应 AGENTS.md R4）。
- [Review] `<style>` 默认 scoped；确需全局样式时写明理由并显式使用 `is:global`。
- [Agent] 客户端交互用 `<script>` 标签，不用 inline `onclick`。
- [Review] 每个组件在文件顶部用一句注释说明职责。
- [Review] 组件对外接口只有 props 与 slot，不依赖父级隐式传入的全局状态。
- [Review] 可插拔模块（搜索 / 评论 / 统计）关闭时，其余功能不受影响。

---

## 4. Markdown 内容

frontmatter 字段定义：

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | string | 是 | — | 中文标题 |
| `description` | string | 是 | — | 摘要，用于列表与 SEO，建议 50–160 字 |
| `pubDate` | date | 是 | — | 发布日期 |
| `updatedDate` | date | 否 | — | 更新日期 |
| `tags` | string[] | 否 | `[]` | 标签，多对多（本项目不使用分类） |
| `draft` | boolean | 否 | `false` | 草稿不进入任何产物 |
| `cover` | string | 否 | — | 封面图相对路径 |

- [Agent] 代码块必须标注语言（如 ` ```ts `），否则语法高亮失效。
- [Agent] 文章配图放在 `src/assets/blog/<slug>/`，Markdown 内用相对路径引用。
- [Review] 站内链接使用绝对路径（`/blog/some-post/`），不跨层级使用相对路径。
- [Agent] 无需手写「转载请注明」之类尾部声明，由布局统一渲染。

---

## 5. 样式与主题

- [Review] 优先使用 Tailwind 工具类；同一位置连续出现 3 条以上自定义 CSS 规则时，考虑抽成组件。
- [Agent] 暗色模式统一用 `dark:` 变体，不维护第二套 CSS 文件。
- [Agent] 中文字体栈需显式声明：
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
               "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC",
               "Source Han Sans SC", sans-serif;
  ```
- [Review] 正文行高 1.75–1.9，段落间距不小于 1em，代码块横向滚动而不换行。
- [Agent] 主题切换脚本内联在 `<head>` 中、先于 CSS 执行，避免首屏闪白（FOUC）。

---

## 6. 可访问性

- [Review] 所有 `<img>` / `<Image>` 必须有有意义的 `alt`；纯装饰图用 `alt=""`。
- [Review] 交互元素键盘可达，不得移除 `focus-visible` 样式。
- [Review] 正文文字与背景对比度达到 WCAG AA（≥ 4.5:1）。
- [Agent] 纯图标按钮必须带 `aria-label`。

---

## 7. SEO

- [Review] 每页 `<title>` 唯一，格式为「文章标题 · 站点名」。
- [Agent] 每页 `<meta name="description">` 取自文章 `description` 或页面常量。
- [Agent] canonical 指向 `SITE_URL + Astro.url.pathname`。
- [Agent] 文章页注入 `BlogPosting` 结构化数据（JSON-LD），含 `headline`、`datePublished`、`author`、`image`。
- [Review] sitemap 不包含 `/404` 与 `/search`。
- [Agent] RSS 只输出最近 20 篇，并同样过滤草稿。

---

## 8. 性能预算

- [Review] 首屏 JS（gzip 后）< 20 KB。
- [Agent] 评论组件懒加载（IntersectionObserver），加载失败时静默隐藏，不阻塞正文渲染。
- [Agent] 搜索索引只在 `/search` 页加载，不在每个页面注入。
- [Review] 首屏图片用 `loading="eager"` 并写明宽高；其余图片 `loading="lazy"`。

---

## 9. Git

- [Review] 提交信息遵循 Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`，type 用英文，描述可中文。
- [Review] 一次提交只做一件事；文章内容与代码改动分开提交。
- [Agent] 每完成一个可独立验证的模块立即提交，不攒改动（对应 AGENTS.md R5）。
- [Agent] 首次提交前确认 `user.name` / `user.email` 已配置，未配置时先询问用户。
- [Review] 阶段边界留有干净提交，任何阶段可单独回滚。
- [Agent] `.gitignore` 必须包含：`node_modules/`、`dist/`、`.astro/`、`.env`、`.DS_Store`。

---

## 10. Review 自查表（提交前逐条过）

- [ ] 破坏性操作与环境变更均已获用户同意（R1 / R2）
- [ ] 新依赖已核对许可证与维护状态，或复用了现有方案（R3）
- [ ] 本次改动已提交（R5），或已说明为何暂不提交
- [ ] `pnpm check` 无错误
- [ ] `pnpm build` 成功，四个产物齐全（`index.html` / `rss.xml` / `sitemap-index.xml` / `pagefind/`）
- [ ] 新增或修改的文章 frontmatter 通过 schema 校验
- [ ] 草稿与未来日期文章未泄漏到任何列表、RSS、sitemap
- [ ] 暗色模式下新页面文字可读，无硬编码颜色
- [ ] 375px 宽度下无横向滚动条
- [ ] 新增图片已压缩且小于 1 MB
- [ ] 站内链接无 404（在 `pnpm preview` 下抽查）
- [ ] 提交信息符合 Conventional Commits
- [ ] 未引入新依赖，或已在提交说明中写明理由
