# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.0.0] - 2026-11-15

### Changed

- 插件更名为 **dsh-ammeter**（原 `dsh-minimax-usage`）：包名、Cordis entry id、客户端模块 id、浏览器路由（`/minimax-usage/api/*` → `/dsh-ammeter/api/*`）、CSS 类前缀与 `data-*` 属性全部更名；CI 里 `allowBuilds` 的键也随之变化，旧的安装需要卸载后重装
- 插件身份不再与任何单一厂商绑定；MiniMax 相关的凭据名、provider id 与接口地址作为**厂商支持项**保留

### Added

- 同时支持 OpenCode Go 与 GLM（智谱 GLM 编程套餐）订阅：用量条按当前 provider 自动切到对应订阅
- OpenCode Go 用量接口 `GET https://opencode.ai/zen/go/v1/usage`，展示 5 小时 / 本周 / 本月三个账户级窗口
- GLM 用量接口 `GET https://api.z.ai/api/monitor/usage/quota/limit`（国内站回退 `open.bigmodel.cn`），按 `unit` 识别 5 小时 / 多日 / 本月工具额度三个窗口
- 凭据支持 `OPENCODE_GO_API_KEY`（或 `OPENCODE_API_KEY`）与 `GLM_API_KEY` / `ZAI_API_KEY` / `Z_AI_API_KEY`
- provider 映射：`opencode-go` → OpenCode Go；`zai` / `zai-coding-plan` / `zai-coding-cn` / `glm` 等 → GLM
- 两个本机校验脚本：`scripts/live-check.mjs`（真跑各家用量接口）与 `scripts/smoke-host.mjs`（Host 半边启动冒烟）

### Fixed

- `prepare` 脚本不再依赖 `npm` 可执行文件（改为直接调 `tsc`），在没有 npm 的环境里安装不再中断
- vitest 改用 `threads` 池，在禁止进程派生的环境里也能跑测试

### Internal

- 内部数据模型由「区域」改为「账号 + 窗口」：MiniMax 的每模型行与其它订阅的账户级窗口统一成同一种 `windows` 结构
- 刷新调度改为按账号记账：任一被跟踪的订阅被实际使用时，都会进入 30 秒刷新循环与 5 小时窗口重置后刷新
- 悬停详情浮层按账号分卡片展示，当前 provider 对应的卡片高亮；MiniMax 之外的订阅展开为 3 行窗口
- OpenCode Go 请求带上自报身份的 User-Agent 且不跟随重定向；GLM 的全球站与国内站接口在 Key 被拒时也会依次尝试

## [0.1.8] - 2026-09-05

### Changed

- 仅在实际运行中的 Agent 使用 MiniMax Token Plan provider 时，每 30 秒强制刷新一次用量；切换 provider 或进入空闲后停止该循环。

## [0.1.7] - 2026-09-04

### Changed

- 将右下角浮动气泡改为模型选择器左侧的紧凑 `5h` / `7d` 内联用量条。
- 仅当前选择 `minimax-cn` 或 `minimax` Token Plan provider 时显示；保留自动刷新、点击刷新和悬停详情。

## [0.1.6] - 2026-08-31

### Added

- 气泡拖到屏幕边缘松手后自动贴边收起，只留一小截标志；悬停（或点一下）滑出，拖回屏幕内取消停靠

### Changed

- 去掉气泡外圈投影和色调光晕，只保留细描边和内部高光
- 浅色主题改用 layer-1 白底，避免 overlay 灰蓝叠黑后发脏

### Fixed

- 气泡改为 portal 到 `document.body`，不再被右侧栏挡住

## [0.1.5] - 2026-08-28

### Fixed

- 修复手动刷新请求 URL 错误的 bug：`load(true)` 实际发到 `/minimax-usage/apiNaN`（一元加号把 `"/refresh"` 转成了 `NaN`），服务器 404 后客户端 `setData({})`，导致气泡瞬间变灰显示"暂无可用账号"，过一会才被下一次 polling 拉回正确数据。改为正确的 `/minimax-usage/api/refresh`。

### Changed

- 优化手动刷新的视觉反馈：点击气泡触发刷新时，气泡核心替换为 indigo spinner 并叠加 indigo 光晕；面板顶部出现横向 shimmer 进度条；live label 切换到刷新色 + 更快闪烁的状态点 + 内联小转圈；空账号状态下显示"正在刷新用量…"。刷新成功后，气泡播放 0.95s 绿色脉冲辉光，给到明确的"刷好了"反馈。

## [0.1.4] - 2026-08-28

### Changed

- 气泡视觉重设计：64px 径向渐变背景 + tone 双层阴影 + SVG 渐变进度环（带辉光）+ tone-aware 字号 + 入场弹性动画
- 加载态加入呼吸光晕与双圈旋转 spinner；详情面板加入渐变描边、tone 左侧色条、shimmer 进度条
- 面板头部加入 M logo + 状态点闪烁动画；气泡增加 `aria-label`，提升无障碍体验

## [0.1.3] - 2026-08-25

### Added

- 每轮快照根据 5 小时窗口的 `intervalEndAt`，在重置时刻 + 30 秒自动再刷一次，及时捕获窗口翻页后的新额度（`interval-reset` reason）

## [0.1.2] - 2026-08-24

### Added

- GitHub Actions CI workflow：每次 push/PR 跑 build + test
- Release workflow：tag 推送时自动建 GitHub Release（带 tarball）+ 发布到 npm，等 CI green 再 publish

## [0.1.1] - 2026-08-24

### Changed

- 气泡中心的百分比数字后追加 `%` 单位（字号 9px，opacity 0.65，顶对齐），更明确表达语义

## [0.1.0] - 2026-08-24

### Added

- 浮窗气泡形式在 DSH Web UI 显示 MiniMax Token Plan 订阅用量
- 支持国内站 (`MINIMAX_CN_API_KEY`) 和国际站 (`MINIMAX_API_KEY`)，未配置的站静默跳过
- 拖动换位置（位置存到 localStorage），悬停/聚焦展开详情面板（5 小时窗口 + 本周窗口，百分比条 + 重置倒计时）
- 智能刷新：整轮 Agent 回到空闲 15 秒后刷新；心跳 2 分钟起步，每次翻倍到 24 小时上限；点击立即刷新；切凭据后立即刷新
- 失败重试：自动尝试多个 endpoint（CN 优先 `api.minimaxi.com`、global 优先 `www.minimax.io`），SSL/网络错误透明重试，认证错误透传
- 36 个 vitest 单元测试覆盖 refresh 调度、normalize、credentials、cache、fetch、service
- DSH bundle manifest（`dsh.bundle.patch` + `dsh.client.platform=web`），可走 `dsh plugin add` 安装
- GitHub Release workflow：tag push 时自动 pack tarball 并上传