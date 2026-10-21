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
| `GH_TOKEN` | Cloudflare 环境变量 | 后台服务端读写 GitHub | 取决于令牌设置 |
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | Actions 部署用 | **注意会过期** |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | 同上 | 永久 |

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
| 启用评论 | `src/consts.ts` 的 `GISCUS`：`enabled: true` 并填入参数 |
| 回滚到上一版 | Cloudflare → Deployments → 选中旧部署 → Rollback |
| 看访问量 | Cloudflare → 项目 → Analytics（需先启用 Web Analytics） |
| 绑定自己的域名 | Cloudflare → 项目 → Custom domains → 添加域名 |

## 四、故障排查

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

## 五、备份与恢复

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

## 六、依赖升级

```bash
pnpm outdated          # 看哪些过期
pnpm update            # 更新到允许范围内的最新
pnpm check && pnpm build && pnpm preview   # 验证
```

**升级前注意**：

- Astro 主版本（如 7 → 8）有破坏性变更，单独安排时间处理
- 升级后如果构建失败，看 [Astro 升级指南](https://docs.astro.build/en/guides/upgrade-to/)
- 依赖版本在 `package.json` 中精确锁定（无 `^`），不会被意外升级

## 七、安全注意事项

- **不要把任何令牌写进代码或文档**，一律走环境变量
- `.dev.vars` 是本地开发用的，已被 `.gitignore` 忽略，不要提交
- 后台密码用强密码；Cloudflare 环境变量里存的是加密的 `secret_text`
- 令牌一旦怀疑泄露，立刻在 GitHub / Cloudflare 撤销并更换
- `/admin/` 与 `/api/*` 已设置 `noindex`，但**不等于访问控制**——真正的保护是密码与签名校验

## 八、成本

| 项目 | 用量 | 费用 |
| --- | --- | --- |
| Cloudflare Pages 静态请求 | 无限 | ¥0 |
| Cloudflare Pages 带宽 | 无限 | ¥0 |
| Pages Functions 请求 | 10 万次/天免费额度（个人使用几乎为 0） | ¥0 |
| GitHub Actions | 2000 分钟/月 | ¥0 |
| 域名 | 用免费的 `*.pages.dev` | ¥0 |

**唯一可能花钱的地方**：想绑自己的域名（约 ¥60–100/年）。绑定后代码无需改动，只改 `src/consts.ts` 的 `SITE_URL`。
