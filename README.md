# dsh-ammeter

**订阅用量表** —— 在 DeepSeek Harness (DSH) Web UI 里，一眼看清你手上每份 AI 订阅还剩多少。

名字取自电流表（ammeter）：它量的不是电流，是你每个订阅窗口里还在流动的额度。

支持：

| 订阅 | 显示的窗口 |
|---|---|
| MiniMax Token Plan | 5 小时 / 本周（按模型分行） |
| OpenCode Go | 5 小时 / 本周 / 本月 |
| GLM 编程套餐 | 5 小时 / 多日 / 本月工具额度 |

插件读取各家官方用量接口，在对话框模型选择器旁显示紧凑的用量条；
**只有当前选中的 provider 属于你已配置的订阅时才会出现**。
密钥复用 DSH **设置 → 模型** 里已配置的订阅 Key，浏览器拿不到明文。

![dsh-ammeter 模型选择器旁的用量条](assets/minimax.png)

## 安装

### 推荐：从 npm 安装

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-ammeter
```

> ⚠️ **别用** `npx dsh plugin`——npm 上 `dsh` 这个名字早在 2016 年就被一个不相关的 JS shell 包占了（`dsh@1.0.1`，作者 `infusion`），它没暴露 CLI bin，会报 `could not determine executable to run`。DSH 的 CLI 在 scoped 包 `@deepseek-ai/dsh` 下，必须用完整名。

`web` 换成你的 profile 名。装完 **重启 DSH**。

### 备选：从 GitHub 装

锁定版本：

```bash
npx @deepseek-ai/dsh plugin --profile web add github:maxli776/dsh-ammeter#v1.0.0
```

或默认分支最新：

```bash
npx @deepseek-ai/dsh plugin --profile web add github:maxli776/dsh-ammeter
```

> 仓库名、包名与插件标识现在统一为 `dsh-ammeter`。

### 构建脚本授权

如果 pnpm 提示不允许跑构建脚本（`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`），在该 profile 的 `pnpm-workspace.yaml` 加上再重跑同一条命令：

```yaml
allowBuilds:
  dsh-ammeter: true
```

### 本地开发版本

```bash
npx @deepseek-ai/dsh plugin --profile web add /path/to/dsh-ammeter
```

开发时建议用 `link:` 安装（`pnpm add link:/path`），改完代码重启 DSH 即生效；发布用 `pnpm pack` 产出的 tarball 安装。

## 配置

在 **设置 → 模型** 里填好对应订阅的 Key（**订阅 Key**，不是普通按量付费 API Key），插件会自动读取。

| 订阅 | 凭据名（按优先级） | 会被哪些 provider id 触发 |
|---|---|---|
| MiniMax 国际站 | `MINIMAX_API_KEY` | `minimax` |
| MiniMax 国内站 | `MINIMAX_CN_API_KEY` | `minimax-cn` |
| OpenCode Go | `OPENCODE_GO_API_KEY`、`OPENCODE_API_KEY` | `opencode-go` |
| GLM 编程套餐 | `GLM_API_KEY`、`ZAI_API_KEY`、`Z_AI_API_KEY` | `zai`、`zai-coding-plan`、`zai-coding-cn`、`glm`、`glm-cn`、`zhipu`、`bigmodel` |

没配 Key 的订阅直接跳过，不会报错。只有**当前选中的 provider** 属于上表时，用量条才出现。

### 给 DSH 加一个 GLM provider

插件只负责显示用量；模型本身仍要在 DSH 的 `llm-pi-ai` 里配好，例如：

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      zai:
        apiKeyEnv: ZAI_API_KEY
```

provider id 叫 `zai`（或 `zai-coding-cn` 等，见上表）即可对上插件的映射。

## 功能

- **内联用量条**：显示在对话框模型选择器左侧，按订阅显示剩余进度（MiniMax 2 行 5h / 7d，OpenCode Go 与 GLM 3 行 5h / 周 / 月）
- **按 provider 显示**：只有当前选择上表里的 provider 时显示；其他 provider 即使模型名含 MiniMax / GLM 也隐藏
- **悬停详情**：鼠标悬停或键盘聚焦可查看账号卡片、套餐名、各窗口剩余进度和重置倒计时；当前 provider 对应的卡片高亮
- **点击刷新**：点一下用量条强制刷新，不改变模型选择或发送操作
- **密钥来源**：优先 `ctx.credentials`，其次进程环境变量
- **自动刷新**：只有实际运行中的 Agent 使用被跟踪的订阅 provider 时，才会每 30 秒强制拉取官方用量；切换到其他 provider 或 Agent 回到空闲后停止这条循环。整轮 Agent 回到空闲且这轮用过这些订阅后，再等 15 秒执行一次空闲刷新；之后心跳从 2 分钟起每次翻倍，上限 24 小时。每轮快照还会按 5 小时窗口的重置时刻 + 30 秒再触发一次「重置后刷新」。用量条每 15 秒只读 Host 缓存。点击立即强制刷新。

## 接口

| 账号 | 用量 URL |
|---|---|
| MiniMax 国际 | `www.minimax.io`，失败则回退 `api.minimax.io` |
| MiniMax 国内 | `api.minimaxi.com`，失败则回退 `www.minimaxi.com` |
| OpenCode Go | `opencode.ai/zen/go/v1/usage` |
| GLM | `api.z.ai`，失败则回退 `open.bigmodel.cn`（`/api/monitor/usage/quota/limit`） |

各家窗口的语义：

- **MiniMax**：按模型给行，每行两个窗口（5 小时 / 本周）。
- **OpenCode Go**：账户级三个窗口（5 小时 / 本周 / 本月），额度按美元计，`percent` 是**已用**占比，插件换算成剩余显示。
- **GLM**：`limits[]` 按 `unit` 认窗口（`3` = 5 小时，`6` = 多日，`TIME_LIMIT` = 本月工具额度），`percentage` 是已用占比。

浏览器侧路由：`/dsh-ammeter/api/status`（读缓存）与 `/dsh-ammeter/api/refresh`（强制刷新）。

## 注意

- 订阅 Key 与普通开放平台 API Key **不能混用**。用量接口拒绝普通 Key 时，页面会提示改用订阅 Key。
- 插件原样展示官方剩余额度，不本地「修正」扣费；`remains_time` 的语义以 MiniMax 控制台为准。
- `*_quota = 0` 的模型会标成「未包含」，而不是 0%。
- OpenCode Go 的额度是**账户级**的：通过 Go 使用 GLM、Kimi、MiniMax 等模型都吃同一份额度，所以用量条按账户显示，不按模型细分。

## 发布

参见 [PUBLISH.md](./PUBLISH.md)：tag push 触发 GitHub Actions，自动 pack → GitHub Release → 等 CI 绿 → publish 到 npm。

## 开发

```bash
npm install
npm test
npm run build
```

两个本机校验脚本（都不会打印 Key）：

```bash
node scripts/live-check.mjs   # 用本机 DSH 凭据真跑一遍各家用量接口，打印 Host 产物 JSON
node scripts/smoke-host.mjs   # 在假 context 上启动 Host 半边，确认路由/事件注册正常
```
