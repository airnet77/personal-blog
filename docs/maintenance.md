# 运维手册

面向「未来的你」：半年后回来改配置时，照着这份文档操作即可。

---

## 一、线上构成

```
用户浏览器
    │
    ▼
Cloudflare Pages（airnet-blog.pages.dev）
    ├── 静态页面（Astro 构建产物）
    └── /api/*（Pages Functions，后台接口）
            │
            ▼
        GitHub API → airnet77/personal-blog 仓库
            │
            ▼（push 触发）
        GitHub Actions：pnpm build → wrangler pages deploy
```

**没有任何服务器需要维护**。所有计算都在 Cloudflare 边缘节点按请求执行。

| 资源 | 位置 |
| --- | --- |
| 网站 | <https://airnet-blog.pages.dev> |
| 后台 | <https://airnet-blog.pages.dev/admin> |
| 代码与内容 | <https://github.com/airnet77/personal-blog> |
| 部署历史 | Cloudflare Dashboard → Workers & Pages → `airnet-blog` → Deployments |
| 构建日志 | GitHub 仓库 → Actions |

## 二、凭证清单

| 凭证 | 存在哪 | 用途 | 有效期 |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Cloudflare 环境变量 | 进后台的密码 | 永久，随时可改 |
| `SESSION_SECRET` | Cloudflare 环境变量 | 签署登录 Cookie | 永久，改了会强制所有人重新登录 |
| `GH_TOKEN` | Cloudflare 环境变量 | 后台与评论读写 GitHub | 取决于令牌设置 |
| `AI_PROVIDER` | Cloudflare 环境变量 | AI 审核协议：`openai`（当前）/ `cloudflare` | 永久 |
| `AI_BASE_URL` | Cloudflare 环境变量 | AI 接口地址：当前 `https://api.deepseek.com/v1` | 永久 |
| `AI_API_KEY` | Cloudflare 环境变量 | DeepSeek 的 API Key | 取决于服务商 |
| `CF_ACCOUNT_ID` | Cloudflare 环境变量 | 仅 `AI_PROVIDER=cloudflare` 时需要 | 永久 |
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | Actions 部署用 | **注意会过期** |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | 同上 | 永久 |

> 评论 AI 审核**不配也能用**：没配 `AI_API_KEY` 时会自动退化成「只跑本地规则」，拿不准的评论转人工审核。

### AI 审核当前配置

| 项 | 值 | 在哪改 |
| --- | --- | --- |
| 服务商 | DeepSeek（OpenAI 兼容协议） | `AI_PROVIDER` / `AI_BASE_URL`（Cloudflare 环境变量） |
| 模型 | `deepseek-flash` | 后台 → 评论设置 → AI 模型名 |
| 超时 | 15 秒（推理模型偏慢，留了余量） | `functions/lib/ai-review.ts` |
| 失败降级 | 转人工审核 | 后台 → 评论设置 → AI 不可用时 |

**换一家 AI 服务商**：

1. Cloudflare → 环境变量，改 `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEY`（三家都支持 OpenAI 兼容协议就行）
2. 后台 → 评论设置 → 改「AI 模型名」
3. 重新部署一次
4. 打开 `/api/health`，确认 `AI_READY: true`

**AI 审核的实际耗时**：线上实测 4–6 秒/条（含模型推理），所以读者点「发表评论」后要等几秒才看到结果，属正常。

**费用参考**：`deepseek-flash` 按 token 计费，一条评论约 100–200 token，个人博客量级每月不到一元钱。

### 修改后台密码

Cloudflare Dashboard → Workers & Pages → `airnet-blog` → **Settings** → **Environment variables** → 编辑 `ADMIN_PASSWORD` → 保存后**重新部署一次**才生效。

### 令牌过期了怎么办

**症状**：

- 后台保存文章报「GitHub API 401」→ `GH_TOKEN` 过期
- 推送代码后 Actions 部署失败，日志显示认证错误 → `CLOUDFLARE_API_TOKEN` 过期

**换 `GH_TOKEN`（GitHub 令牌）**

1. <https://github.com/settings/tokens> 生成新令牌，勾选 `repo`（后台写文件够用）
2. Cloudflare → 环境变量 → 更新 `GH_TOKEN`
3. 重新部署（否则不生效）

**换 `CLOUDFLARE_API_TOKEN`**

1. Cloudflare → My Profile → API Tokens → Create Token
2. 权限：`Account` → `Cloudflare Pages` → `Edit`
3. 复制令牌，到 GitHub 仓库 → Settings → Secrets and variables → Actions → 更新 `CLOUDFLARE_API_TOKEN`

## 三、日常操作

| 想做什么 | 怎么做 |
| --- | --- |
| 写/改文章 | 打开后台 → 编辑 → 保存 → 等 1–2 分钟 |
| 改站点名称/作者/简介 | 后台改不了，改 `src/consts.ts` 后推送 |
| 改导航菜单 | 同上，`src/consts.ts` 的 `NAV_LINKS` |
| 开关评论 | 后台 → **评论设置** → 评论总开关 |
| 改评论字数 / 每日上限 / 展示条数 | 后台 → **评论设置**（保存后最多 1 分钟生效） |
| 维护违禁词 | 后台 → **违禁词** → 改完点保存；「恢复默认」可回到内置词表 |
| 处理待审评论 | 后台 → **评论管理** → 顶部筛选「待审」→ 通过 或 判为违规 |
| 查看被判违规的评论 | 后台 → **评论管理** → 筛选「违规」（前台永远看不到这些） |
| 封禁刷评论的人 | 后台 → **用户管理** → 封禁 7 天 / 永久封禁 |
| 回滚到上一版 | Cloudflare → Deployments → 选中旧部署 → Rollback |
| 看访问量 | Cloudflare → 项目 → Analytics（需先启用 Web Analytics） |
| 绑定自己的域名 | Cloudflare → 项目 → Custom domains → 添加域名 |

> 评论系统是自建的（数据在仓库 `comments/` 目录），配置全部在后台，不再使用 Giscus。

## 四、评论治理速查

### 四种状态

| 状态 | 含义 | 前台可见 |
| --- | --- | --- |
| `visible` | 正常评论 | 是 |
| `pending` | AI 拿不准 / AI 不可用 → 等人工审核 | 否 |
| `rejected` | 命中涉政/违禁词/链接/规则/AI 判违规 | **永远否**（只留档） |
| `hidden` | 博主手动隐藏的可见评论 | 否 |

### 配置文件在哪

| 文件 | 内容 | 怎么改 |
| --- | --- | --- |
| `comments/_config.json` | 全部开关与数值 | 后台「评论设置」 |
| `comments/_wordlist.json` | 七类违禁词 | 后台「违禁词」 |
| `comments/_moderation.json` | 设备台账（配额、违规次数、封禁） | 后台「用户管理」，不建议手改 |
| `comments/<slug>.json` | 每篇文章的评论 | 后台「评论管理」 |

删掉 `_config.json` 或 `_wordlist.json` 会回到内置默认值，这是最省事的「恢复出厂」。

### 审核顺序

```
总开关 → 蜜罐 → 设备识别 → 封禁/配额/频率 → 长度
      → 违禁词（涉政硬拒） → 只许文字（链接/图片/HTML）
      → 本地规则（刷屏/纯符号） → AI（拿不准转人工）
```

### 常见现象与处理

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 评论提交后一直不出现 | 进了待审（AI 拿不准或 AI 未配置） | 后台 → 评论管理 → 待审 |
| 提示「评论违规，未发送」 | 命中违禁词 / 链接 / 图片 / 规则 | 后台 → 评论管理 → 违规，看原因 |
| 正常评论也被拒 | 涉政词表过宽（`党` `主义` `政府` 等） | 后台 → 违禁词 → 删词或关掉该类 |
| 所有人都提示 AI 不可用 | `AI_API_KEY` 没配 / 额度用完 | 补环境变量，或后台把「AI 审核模式」改为「仅本地规则」 |
| 评论提示 429 | 触发每日或每分钟配额 | 后台 → 评论设置 调整 `dailyLimit` / `burstLimit` |
| 某设备被自动封禁 | 违规达到阈值（默认 3 次） | 后台 → 用户管理 → 解封 / 清零违规 |

## 五、故障排查

### 后台打不开 / 登录后一直转圈

1. 打开 `https://airnet-blog.pages.dev/api/health`
2. 看 `missing` 数组里缺哪个环境变量
3. 去 Cloudflare 补齐后**重新部署**

### 后台能登录，但保存文章报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `未登录或登录已过期` | Cookie 过期（7 天） | 重新登录 |
| `GitHub API 401` | `GH_TOKEN` 失效 | 换令牌 |
| `GitHub API 403` | 令牌没有 Contents 写权限 | 重新生成令牌 |
| `这篇文章已被其他地方修改` | 文件 sha 冲突 | 刷新后台重新编辑 |
| `slug 只能用小写字母…` | 文件名不合法 | 用英文小写与连字符 |

### 保存了但线上没更新

1. 去 GitHub 仓库看有没有新提交
   - **没有**：后台的 `GH_TOKEN` 有问题
   - **有**：看 Actions 是否成功
2. Actions 失败 → 点进去看哪一步红了
3. 都成功但页面没变 → 可能是浏览器缓存，强制刷新（Ctrl+Shift+R）

### 构建失败常见原因

| 日志关键词 | 原因 | 处理 |
| --- | --- | --- |
| `Multiple versions of pnpm specified` | workflow 与 package.json 版本冲突 | 只保留 `packageManager` 一处 |
| `ERR_PNPM_IGNORED_BUILDS` | 依赖的构建脚本被拦截 | 检查 `pnpm-workspace.yaml` 的 `allowBuilds` |
| `Node version` | Node 太旧 | workflow 里已固定 24 |

## 六、备份与恢复

**内容本身就在 GitHub**，天然有版本历史：

- 每篇文章的每次修改都是一次提交
- 误删文件？在 GitHub 上找到删除前的提交，`Revert` 即可
- 整站代码：`git clone` 下来就是完整备份

**建议的额外备份**（可选）：

```bash
# 每周克隆一份到本地
git clone https://github.com/airnet77/personal-blog.git backup-$(date +%Y%m%d)
```

或者直接在 GitHub 上建 Fork。

## 七、依赖升级

```bash
pnpm outdated          # 看哪些过期
pnpm update            # 更新到允许范围内的最新
pnpm check && pnpm build && pnpm preview   # 验证
```

**升级前注意**：

- Astro 主版本（如 7 → 8）有破坏性变更，单独安排时间处理
- 升级后如果构建失败，看 [Astro 升级指南](https://docs.astro.build/en/guides/upgrade-to/)
- 依赖版本在 `package.json` 中精确锁定（无 `^`），不会被意外升级

## 八、安全注意事项

- **不要把任何令牌写进代码或文档**，一律走环境变量
- `.dev.vars` 是本地开发用的，已被 `.gitignore` 忽略，不要提交
- 后台密码用强密码；Cloudflare 环境变量里存的是加密的 `secret_text`
- 令牌一旦怀疑泄露，立刻在 GitHub / Cloudflare 撤销并更换
- `/admin/` 与 `/api/*` 已设置 `noindex`，但**不等于访问控制**——真正的保护是密码与签名校验
- 评论数据（含违规留档）在公开仓库的 `comments/` 目录里，**任何人可见**；所以台账里只存 IP 的 8 位哈希，不存明文 IP
- 设备指纹是「尽力识别」，不是安全边界：清缓存或换浏览器就能换一个身份，真正的兜底是 IP 维度配额与人工封禁

## 九、成本

| 项目 | 用量 | 费用 |
| --- | --- | --- |
| Cloudflare Pages 静态请求 | 无限 | ¥0 |
| Cloudflare Pages 带宽 | 无限 | ¥0 |
| Pages Functions 请求 | 10 万次/天免费额度（个人使用几乎为 0） | ¥0 |
| GitHub Actions | 2000 分钟/月 | ¥0 |
| 域名 | 用免费的 `*.pages.dev` | ¥0 |
| 评论 AI 审核 | 按量计费；个人博客量级每月几分钱，不配则为 ¥0 | 约 ¥0–1/月 |

**唯一可能花钱的地方**：想绑自己的域名（约 ¥60–100/年）。绑定后代码无需改动，只改 `src/consts.ts` 的 `SITE_URL`。
