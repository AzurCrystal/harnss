# PROGRESS

最后更新时间：2026-07-26

## 维护规则

- 本文件是唯一全局进度账本，不自行扩张 `GOAL.md` 的产品范围。
- 状态只允许 `未开始`、`进行中`、`受阻`、`已完成`。
- `已完成` 必须附可复查的实际证据；`受阻` 必须写明当前不可达的前置条件；部分完成只能标为 `进行中`。
- 全局里程碑保持下列六项；实际发现的 UI 能力只登记到“能力映射台账”。
- 能力处置只允许 `接入 OMP`、`暂时保留`，或按用户明确修改的产品契约 `删除`；新增一行必须同时有实际 Harnss 源码依据和 OMP 官方 RPC 依据。
- 不使用完成百分比；每次更新本文件时同步更新“最后更新时间”和“唯一下一步”。

## 全局里程碑

| ID | 里程碑 | 状态 | 证据或阻塞 |
| --- | --- | --- | --- |
| DOC-01 | 建立 GOAL 与全局进度契约 | 已完成 | `GOAL.md`、`PROGRESS.md` 及根目录结构检查（本次仅创建这两份文件） |
| BASE-01 | 导入 Harnss 前端基线 | 已完成 | 上游 `OpenSource03/harnss@dc1dfd8a33caa46a1eefcfe9e14697b27ac4c33d`；本地已导入该提交完整跟踪树 |
| CUTOVER-01 | 移除非 OMP agent backend | 已完成 | Electron、preload 与 renderer 仅保留 OMP agent 运行入口；ACP Agent 设置、registry IPC 与持久化已移除 |
| RPC-01 | 接入 OMP 官方 RPC | 已完成 | `electron/src/lib/omp-rpc.ts`、`electron/src/ipc/omp-sessions.ts` 与 `src/hooks/useOMP.ts` 已实现官方 protocol v2 通信 |
| UI-01 | 逐项登记并处理原生 UI 能力 | 已完成 | 下列 26 项能力均已按“接入 OMP”“暂时保留”或明确产品契约“删除”完成处置并附实现证据；renderer 与 Electron 本地界面文案以简体中文呈现 |
| VERIFY-01 | 完成最终构建与端到端验收 | 已完成 | `pnpm test`：40 files / 218 tests；`tsc` 与 `pnpm build` 通过；真实 Electron 已完成简体中文 UI、组合输入、OMP MCP add/remove、同一 session 精确恢复及 `smoke_echo → HARNSS_MCP_OK` 工具调用验收 |

## 能力映射台账

已导入上游 Harnss，并以实际源码和 OMP 官方 `v17.1.3` RPC 契约逐项登记；全部能力已完成接入、明确保留或按产品契约删除。

| 能力 | Harnss 源码依据 | OMP RPC 依据 | 处置 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| OMP session 创建、恢复与状态 | `src/hooks/session/useSessionLifecycle.ts:126-378`；`useSessionRevival.ts:187-290` | `docs/rpc.md:1-230`；`rpc-types.ts:30-48,197-250`（`prompt`、`new_session`、`switch_session`、`get_state`） | 接入 OMP | 已完成 | `electron/src/ipc/omp-sessions.ts` 与 `src/hooks/session/useSessionRevival.ts`；Electron 新建、重启与恢复会话实测通过 |
| 本地聊天选择、重命名、删除、搜索与持久化 | `src/hooks/session/useSessionCrud.ts:126-179,289-333`；`electron/src/ipc/sessions.ts:33-179` | `docs/rpc.md:1-230` 未提供宿主 UI 元数据 CRUD；session 列表为宿主责任 | 暂时保留 | 已完成 | `electron/src/ipc/sessions.ts`、`src/lib/session/records.ts`；标题与 OMP session identity 已持久化并实测恢复 |
| Claude Code 历史导入 | `src/hooks/session/useSessionCrud.ts:367-417`；`electron/src/ipc/cc-import.ts` | `rpc-types.ts:76-88,307-324` 仅支持 OMP session 切换与消息读取，无 Claude 历史导入命令 | 暂时保留 | 已完成 | 现有入口保留；`src/hooks/session/useSessionCrud.ts` 明确提示该操作未由 OMP RPC 实现，不作隐式转换 |
| 文本、图片、文件/目录与浏览器元素上下文发送 | `src/components/input-bar/InputBar.tsx:231-453` | `rpc-types.ts:33-37`（`prompt`/`steer`/`follow_up` 的 text 与 `ImageContent[]`） | 接入 OMP | 已完成 | `src/hooks/useOMP.ts` 与 `src/lib/engine/omp-adapter.ts` 生成官方 prompt/steer/follow_up 与 image payload |
| 流式文本、thinking、错误与完成状态 | `src/components/ChatView.tsx:149-244,302-393`；`src/hooks/useClaude.ts:241-478` | `packages/agent/src/types.ts:767-788`；`packages/ai/src/types.ts:900-927`（`message_*` 与 delta） | 接入 OMP | 已完成 | `src/lib/engine/omp-adapter.ts` 映射 message/thinking/error/agent lifecycle；Electron 实测 assistant delta 与完成状态 |
| 工具调用、进度、结果和错误可视化 | `src/components/ToolCall.tsx`；`src/hooks/useClaude.ts:241-478` | `packages/agent/src/types.ts:767-788`（`tool_execution_start/update/end`） | 接入 OMP | 已完成 | `src/lib/engine/omp-adapter.ts` 映射 tool_execution start/update/end 至既有 `UIMessage` 工具结构 |
| 停止、interrupt 与边界消息队列 | `src/hooks/session/useMessageQueue.ts:241-289,358-442` | `rpc-types.ts:33-37,59-61`（`abort`、`steer`、`follow_up`、queue modes） | 接入 OMP | 已完成 | `src/hooks/useOMP.ts` 与 `src/hooks/session/useMessageQueue.ts` 使用官方 abort/steer/follow_up |
| Agent 用户问题选择、确认与输入 | `src/components/PermissionPrompt.tsx:170-223` | `rpc-types.ts:361-417,524-528`（`extension_ui_request/response`） | 接入 OMP | 已完成 | `src/lib/engine/omp-adapter.ts` 将 confirm/select/input/notify 请求映射到既有 UI 并回传 extension_ui_response |
| 工具权限范围与 session 中动态权限模式 | `src/components/PermissionPrompt.tsx:42-125,192-206`；`useSessionSettings.ts:191-253` | `docs/approval-mode.md:11-22`；RPC 无动态 permission-mode 命令，只能启动参数设置 | 暂时保留 | 已完成 | 既有 approval 控件保留；`useSessionRevival.ts` 仅在 OMP 启动时传 `approvalMode`，不伪造动态命令 |
| 现有 plan approval gate | `src/components/PermissionPrompt.tsx:192-283` | `rpc-types.ts:28-91` 无等价 plan gate 命令；`goal_updated` 仅为事件 | 暂时保留 | 已完成 | `src/components/input-bar/EngineControls.tsx` 保留原控件并明确禁用为“OMP 计划审批尚未实现” |
| 模型选择与 reasoning level | `src/components/input-bar/EnginePickerDropdown.tsx:105-223` | `rpc-types.ts:51-57,262-288`（`get_available_models`、`set_model`、`set_thinking_level`） | 接入 OMP | 已完成 | `src/hooks/useOMP.ts` 与 `omp-adapter.ts` 使用官方 provider/modelId 与 thinking level；恢复场景和 selector 回归测试通过 |
| ACP session config 控件 | 原 `src/components/input-bar/EnginePickerDropdown.tsx` 与 ACP Agent 选择链路 | `rpc-types.ts:28-91` 无 ACP config option 命令 | 删除 | 已完成 | 输入栏现为固定 OMP model/thinking selector，不再接收 ACP agent/config 数据或提供 `Manage ACPs` 入口 |
| Context 使用量与手动 compact | `src/components/input-bar/ContextGauge.tsx:31-78` | `rpc-types.ts:41,65-66,220,294-298`（`get_state.contextUsage`、`compact`） | 接入 OMP | 已完成 | `omp-adapter.ts` 映射 contextUsage，`useOMP.ts` 发送官方 compact |
| Slash command 自动补全与执行 | `src/components/input-bar/CommandPicker.tsx:1-66`；`InputBar.tsx:180-219` | `rpc-types.ts:42,129-138,222-228`（`get_available_commands`、`available_commands_update`） | 接入 OMP | 已完成 | `useOMP.ts` 获取命令目录，`omp-adapter.ts` 映射 available_commands_update，输入栏继续复用原补全 UI |
| Todo/plan 检查表面板 | `src/components/TodoPanel.tsx:9-63`；`useAppContextualPanels.ts:20-37` | `rpc-types.ts:43,226-228`；`agent-session-events.ts:12-65`（`set_todos`、todo/goal events） | 接入 OMP | 已完成 | `omp-adapter.ts` 将 todo/goal 更新映射为既有 todo 工具消息与面板状态 |
| Background subagent 状态、事件和 transcript | `src/components/BackgroundAgentsPanel.tsx:52-219`；`AgentTranscriptViewer.tsx:87-94` | `rpc-types.ts:46-48,232-250,336-352`（subscription、snapshot、messages、events） | 接入 OMP | 已完成 | `useOMP.ts` 订阅 events；`omp-adapter.ts` 映射 subagent snapshot/event/messages 到既有面板 |
| 单独停止 background task | `src/hooks/useBackgroundAgents.ts:40-50` | `rpc-types.ts:28-91` 只有 session `abort`，无单个 subagent stop 命令 | 暂时保留 | 已完成 | 现有面板保留；单 subagent stop 明确提示 OMP RPC 尚未实现，不用全局 abort 冒充 |
| MCP server 配置管理 | `src/components/McpPanel.tsx`；`electron/src/ipc/mcp.ts` | OMP `v17.1.3` `docs/mcp-config.md` 与 `mcp-schema.json`（项目配置 `<cwd>/.omp/mcp.json`）；RPC 无 MCP 热重载命令 | 接入 OMP | 已完成 | `electron/src/lib/mcp-store.ts` 原子读写 OMP 项目配置；`omp-sessions.ts` 在 idle 时 stop 并按精确 `sessionFile` resume；真实 Electron add/remove、同一 session 与 `smoke_echo → HARNSS_MCP_OK` 实测通过 |
| MCP OAuth 与 reconnect | `src/components/mcp/McpAuthStatus.tsx`；`src/components/McpPanel.tsx` | `rpc-types.ts:28-91` 无 MCP OAuth/reconnect 命令 | 暂时保留 | 已完成 | OAuth 控件保留但明确禁用为“OMP RPC 不支持 MCP OAuth 管理”；配置变更只使用已验证的 stop/resume，不伪造 reload/reconnect |
| 文件 checkpoint/revert | `src/components/MessageBubble.tsx:65-76,220-313`；`useSessionRestart.ts:204-239` | `rpc-types.ts:28-91` 无文件 checkpoint/revert 命令 | 暂时保留 | 已完成 | 既有 UI 保留；`useSessionRestart.ts` 对 OMP 不支持的 full revert 显示明确错误，不调用外部 fallback |
| Worktree 选择与在新 cwd 重启 session | `src/components/WorktreeBar.tsx:46-181`；`useSessionRestart.ts:124-202` | `docs/rpc.md:1-25`（RPC 使用常规 CLI `--cwd`）与 `get_state` | 接入 OMP | 已完成 | `useSessionRestart.ts` 以选定 cwd 启动 OMP；Git/worktree UI 未重做 |
| ACP/Codex 专用认证对话框 | 原 ACP/Codex backend 设置与认证入口 | OMP provider login 不等价 ACP/Codex auth UI | 删除 | 已完成 | 非 OMP backend 认证入口与 ACP Agent 设置链路均已移除，未添加替代认证或隐式映射 |
| 自动 session 标题生成 | `src/hooks/session/useSessionPersistence.ts:474-516`；`electron/src/ipc/title-gen.ts:163-219` | `rpc-types.ts:33,202`（隔离 OMP RPC prompt） | 接入 OMP | 已完成 | `useSessionPersistence.ts` 调用 `omp:generate-title`；Electron 实测生成“Exact OMP E2E Reply”并持久化 |
| AI commit message 生成 | `electron/src/ipc/title-gen.ts:222-315` | `rpc-types.ts:33,202`（隔离 OMP RPC prompt） | 接入 OMP | 已完成 | `electron/src/ipc/title-gen.ts` 复用隔离官方 OMP RPC prompt，并传播终态错误 |
| Installed agent/ACP Agent Store 管理 | 原 `src/components/settings/AgentSettings.tsx`、`AgentStore.tsx` 与 `src/hooks/useAgentRegistry.ts` | `rpc-types.ts:28-91` 无 Agent Store/ACP registry 命令 | 删除 | 已完成 | 设置与欢迎向导入口、renderer registry 状态、`agents:*` IPC、preload bridge、`agents.json` 持久化及专用类型/测试已删除；Electron 设置页实测无相关入口 |
| 多 session、split pane 与后台切换 | `src/components/split/SplitChatPane.tsx:79-305`；`AppLayout.tsx:1009-1091` | `docs/rpc.md:1-25`；`rpc-types.ts:38,76-88`（每 pane 独立 process/session） | 接入 OMP | 已完成 | `omp-sessions.ts` 按 Harnss sessionId 路由独立 OMP transport；原 split/background store UI 保留 |

## 唯一下一步

无：当前 `GOAL.md` 完成标准已满足；后续工作只由用户明确修改的 GOAL/SPEC 或可复现失败场景触发。
