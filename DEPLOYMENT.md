# 神迹对决 - MCP / 测试 / Vercel 部署说明

## 1. 当前状态

这个项目已经具备：

- SecondMe OAuth 登录
- 英雄图鉴、卡牌图鉴、好友列表
- 快速战斗 / 排位赛 / 杀戮模式 / 新手教学
- 最小 integration-facing API
  - `GET /api/healthz`
  - `GET /api/integration/manifest`
  - `GET /api/integration/tools`
  - `POST /api/integration/call`

## 2. 重要限制

当前代码里的会话与排位经验使用内存 `Map` 保存：

- `const sessions = new Map()`

这对本地开发和 Demo 可用，但对 Vercel 生产环境不可靠，因为 Serverless 实例是无状态的。

上线前建议至少迁移以下数据到外部存储：

- 登录会话
- SecondMe token
- 排位经验 / 段位
- 好友缓存

推荐任选其一：

- Upstash Redis
- Vercel KV
- Supabase / Postgres

当前代码已经支持：

- 有 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 时，优先使用 Upstash Redis
- 没有时，自动回退到内存模式

## 3. MCP 接口设计

当前最小工具面如下：

1. `get_player_profile`
   - 作用：读取当前 SecondMe 用户资料与段位
   - 鉴权：`Authorization: Bearer <accessToken>`

2. `list_game_heroes`
   - 作用：返回英雄列表，支持按阵营筛选
   - 输入：`{ faction?: string }`

3. `list_game_cards`
   - 作用：返回卡牌图鉴，支持按类别筛选
   - 输入：`{ category?: string }`

4. `create_battle_entry`
   - 作用：为指定英雄生成战斗深链
   - 输入：`{ heroId: string, mode?: "quick" | "ranked" | "slaughter" }`

## 4. 本地测试

启动项目：

```bash
npm run dev
```

运行冒烟测试：

```bash
npm run smoke
```

它会检查：

- `/api/healthz`
- `/api/integration/manifest`
- `/`
- `/tutorial`
- integration call 未鉴权时是否正确返回 `401`

## 5. Vercel 环境变量

至少配置这些：

```env
APP_BASE_URL=https://your-domain.vercel.app
SECONDME_CLIENT_ID=...
SECONDME_CLIENT_SECRET=...
SECONDME_REDIRECT_URI=https://your-domain.vercel.app/api/auth/callback
SECONDME_OAUTH_URL=https://go.second.me/oauth/
SECONDME_API_BASE_URL=https://api.mindverse.com/gate/lab
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## 6. SecondMe Develop 必须同步修改

部署前去 SecondMe Develop 后台同步更新：

- `Redirect URI`
  - 从本地：
    - `http://localhost:3010/api/auth/callback`
  - 改为线上：
    - `https://your-domain.vercel.app/api/auth/callback`

否则线上 OAuth 会直接失败。

## 7. Vercel 部署步骤

### 方案 A：Dashboard

1. 把仓库推到 GitHub
2. 在 Vercel 导入该仓库
3. Framework 选 Other
4. Build Command 留空
5. Install Command：`npm install`
6. Output Directory 留空
7. 配置环境变量
8. 部署

### 方案 B：CLI

```bash
npm i -g vercel
vercel
vercel --prod
```

## 8. 生产验证顺序

部署成功后按这个顺序验证：

1. `GET /api/healthz`
2. 打开首页
3. 点击 SecondMe 登录
4. 回调后确认头像、个人信息、好友列表
5. 打开英雄图鉴 / 卡牌图鉴
6. 进入快速战斗
7. 进入排位赛并验证段位经验变动
8. 刷新页面后确认登录态和段位仍存在
9. 访问 `GET /api/integration/manifest`
10. 用 bearer token 调 `POST /api/integration/call`

## 9. 提交 SecondMe Integration 前的确认项

你后面在提审时，需要明确这些信息：

- `skill.key`
- `skill.displayName`
- `skill.description`
- `mcp.endpoint`
- `release endpoint`
- `oauth.appId`
- `authMode = bearer_token`
- 工具清单与用途

当前项目里最合适的 endpoint 候选是：

- `https://your-domain.vercel.app/api/integration/manifest`
- `https://your-domain.vercel.app/api/integration/call`

## 10. 下一步建议

如果要真正进入生产，而不是只做黑客松 Demo，优先级建议是：

1. 先把会话和段位迁移到外部存储
2. 再上 Vercel 生产域名
3. 验证 OAuth 回调
4. 验证 integration bearer token 调用
5. 最后再做 SecondMe integration 提审
