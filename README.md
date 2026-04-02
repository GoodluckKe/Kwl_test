# 神迹对决 (Shenji Duel)

## 项目简介

神迹对决是一款基于 SecondMe 平台的 A2A (Agent-to-Agent) 卡牌对战游戏。游戏中，玩家可以通过 SecondMe 登录，与其他 SecondMe 用户进行匹配对战，或者与 AI 对手进行游戏。游戏支持历史战绩记录、头像生成等功能。

## 技术栈

### 后端
- **Node.js**: JavaScript 运行时环境
- **Express.js**: Web 框架，用于构建 API 端点和处理 HTTP 请求
- **SQLite**: 轻量级关系型数据库，用于存储历史战绩
- **SecondMe API**: 用于用户认证、获取用户信息和存储历史战绩

### 前端
- **HTML5**: 页面结构
- **CSS3**: 页面样式
- **JavaScript**: 客户端逻辑
- **SVG**: 用于生成英雄和卡牌头像

### 工具
- **Trae API**: 用于生成英雄和卡牌的头像图片
- **npm**: 包管理工具
- **SQLite3**: SQLite 数据库驱动

## 用到的 SecondMe Skills

1. **SecondMe OAuth 登录**: 用于用户认证和获取用户信息
2. **SecondMe Key Memory**: 用于存储用户的历史战绩，实现跨会话持久化
3. **SecondMe Agent Chat**: 用于 AI 决策和玩家托管功能

## 开发遇到的问题及解决方案

### 1. 头像加载问题
- **问题**: 英雄和卡牌的头像无法加载，显示 "The image is generating... Please refresh page to preview."
- **解决方案**: 
  - 运行 `generate-hero-assets.js` 和 `generate-card-assets.js` 脚本，为所有英雄和卡牌生成本地头像图片
  - 修改 `getHeroAvatar` 和 `getCardAvatar` 函数，使用本地生成的头像图片，而不是从 API 加载
  - 在头像 URL 中添加时间戳参数，避免浏览器缓存

### 2. 历史战绩丢失问题
- **问题**: 退出登录后再次登录，历史战绩丢失，显示 "暂无历史战绩"
- **解决方案**:
  - 实现了多层级存储策略：
    1. 尝试使用 SecondMe Key Memory 存储战绩
    2. 同时保存到 SQLite 数据库作为 fallback
    3. 同时保存到会话存储，以便快速加载
  - 确保在用户登录时从 SecondMe Key Memory 或数据库加载历史战绩

### 3. 匹配对手问题
- **问题**: 匹配不到其他玩家，游戏体验不佳
- **解决方案**:
  - 实现了 10 秒匹配倒计时
  - 如果匹配不到其他玩家，自动生成 6 个 AI 对手
  - 使用 SecondMe Agent Chat 为 AI 对手提供思考能力

### 4. SecondMe API 调用问题
- **问题**: SecondMe Key Memory API 调用失败，返回 404 Not Found
- **解决方案**:
  - 实现了 fallback 机制，当 SecondMe API 调用失败时，使用 SQLite 数据库存储和加载历史战绩
  - 添加了详细的错误日志，便于调试和排查问题

### 5. 头像图片生成问题
- **问题**: 生成的头像图片质量低，加载速度慢
- **解决方案**:
  - 使用 Trae API 生成高质量的头像图片
  - 优化生成脚本，提高生成速度
  - 将生成的头像图片存储在本地，避免重复生成

## 项目结构

```
├── server.js              # 主服务器文件
├── generate-hero-assets.js # 生成英雄头像和语音的脚本
├── generate-card-assets.js # 生成卡牌头像和语音的脚本
├── public/                # 静态文件目录
│   ├── hero-images/       # 英雄头像图片
│   ├── card-images/       # 卡牌头像图片
│   ├── hero-voices/       # 英雄语音
│   ├── card-voices/       # 卡牌语音
│   ├── quick-battle.js    # 游戏逻辑
│   └── home-voice.js      # 首页语音播放
├── data/                  # 数据目录
│   └── battle-history/    # 历史战绩存储
│       └── battle_history.db # SQLite 数据库文件
├── .env.local             # 环境变量配置
└── package.json           # 项目配置和依赖
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 文件为 `.env.local`，并填写 SecondMe Client ID 和 Client Secret：

```
SECONDME_CLIENT_ID=your-client-id
SECONDME_CLIENT_SECRET=your-client-secret
SECONDME_REDIRECT_URI=http://localhost:3010/api/auth/callback
```

### 生成头像和语音

```bash
node generate-hero-assets.js
node generate-card-assets.js
```

### 启动服务器

```bash
node server.js
```

服务器将在 http://localhost:3010 上运行。

## 游戏玩法

1. **登录**: 使用 SecondMe 账号登录游戏
2. **匹配**: 点击 "开始游戏" 按钮，系统会尝试匹配其他玩家，匹配不到则生成 AI 对手
3. **游戏**: 玩家和对手轮流出牌，目标是击败对方阵营
4. **历史战绩**: 游戏结束后，战绩会自动保存，可在首页查看历史战绩

## 注意事项

- 确保 SecondMe Client ID 和 Client Secret 正确配置
- 生成头像和语音可能需要一些时间，请耐心等待
- 如果遇到问题，请查看服务器日志以获取详细信息

## 许可证

MIT
