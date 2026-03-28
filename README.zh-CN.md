# UDD Kit

[English README](./README.md)

**UDD Kit** 是一个面向 AI Agent 生态的自愈运行时。它检测故障、匹配上游修复、尝试自动修复、并把修复回馈上游。

UDD = **User-Directed Development（用户主导开发）** -- 软件演进由用户和他们的 Agent 驱动，而不只是公司路线图。

## 快速开始（Agent 环境 -- 推荐）

对于被 AI Agent 使用的产品（Claude Code、Codex 等），集成 **不需要写任何代码**：

```bash
npm install -g udd-kit
cd /path/to/your/product
udd init
```

`udd init` 做两件事：
1. 自动生成 `udd.config.json`（自动检测 repo、语言、版本源）
2. 直接输出一段填好产品信息的 **Self-Healing Protocol 提示词** -- 复制粘贴到你的 agent 指令文件即可（CLAUDE.md、AGENT_INSTRUCTIONS.md、system prompt 等）

完事。当 agent 遇到故障时，它会派生一个独立的 subagent 来运行 UDD 诊断和修复。

### 为什么用 subagent？

- **语义匹配精度**：subagent 本身就是 LLM，直接读 changelog 和错误信息做语义判断，比关键词匹配精确得多
- **递归依赖隔离**：修复 agent 和被修复的产品在不同进程里，不存在"修复工具本身坏了"的问题
- **零集成代码**：一个 config + 一段提示词，没有 adapter、没有事件监听、没有代码改动

## 快速开始（代码集成）

CI/CD 管道、后台监控、Web 服务等无 agent 环境：

```ts
import { initUdd } from "udd-kit/quick";

const { runtime, adapter } = await initUdd({ name: "my-app" });

// 检查上游是否已经修复了你的问题
const check = await runtime.check(adapter);
if (check.upstreamFixMatch) {
  console.log(check.upstreamFixMatch.recommendation);
}

// 订阅事件
runtime.events.on("update:fixes-local-error", ({ match, update }) => {
  console.log(`上游 ${update.latestVersion} 修复了这个问题：${match.recommendation}`);
});

// 后台健康监控
runtime.watch(adapter, { intervalMs: 300_000 });
```

## 核心闭环

```
出错 → 收集 incident → 诊断（LLM 语义匹配 or 文本 fallback）
  → 选择策略 → 在隔离 worktree 中修复 → 运行验证 hooks
    → 成功：提交 PR 到上游
    → 失败：生成脱敏 issue 上报
```

## 两种集成路径

| | Agent（提示词集成） | 代码集成 |
|---|---|---|
| 方式 | `udd init` + 粘贴提示词 | `initUdd()` + adapter 代码 |
| 语义匹配 | Agent 自身的 LLM 能力 | 内置文本匹配（或 adapter 覆盖） |
| 递归依赖 | Subagent 天然隔离 | 不适用 |
| 适用场景 | 被 AI Agent 使用的产品 | CI/CD、定时任务、Web 服务 |

## 架构

```
宿主产品 ──→ UDD Adapter ──→ UDD Runtime
                                 ├── Incident Collector（事件收集）
                                 ├── Diagnosis Engine（诊断引擎 + changelog-error 匹配）
                                 ├── Strategy Selector（策略选择）
                                 ├── Repair Agent / Update Provider（修复执行）
                                 ├── Verification Engine（验证引擎）
                                 ├── Contribution Flow（PR 回馈）
                                 ├── Issue Escalation Flow（Issue 上报）
                                 ├── Event Bus（事件总线）
                                 ├── State Store（状态持久化）
                                 └── Audit Log（审计日志）
```

## 核心能力

- **Changelog-Error 智能匹配**：对比本地错误和上游 release notes，判断问题是否已被上游修复。Agent 环境用 LLM 语义匹配，非 agent 环境用确定性文本匹配 fallback。
- **自愈闭环**：诊断 → 策略 → 修复 → 验证 → 贡献/上报，全自动。
- **隔离修复**：所有修复在 git worktree 中进行，验证通过才能提升。
- **事件系统**：订阅 `update:available`、`update:fixes-local-error`、`heal:completed` 等事件。
- **Watch 模式**：`runtime.watch()` 后台健康监控，通过事件驱动通知。
- **隐私保护**：自动脱敏 token、secret、绝对路径，再生成 issue/PR。
- **零运行时依赖**：完全基于 Node.js 内置模块。

## CLI

```bash
udd init [--repo owner/name] [--force]       # 生成 config + agent 提示词
udd check [--json]                            # 检查上游更新
udd analyze --error "msg" [--json]            # 诊断错误
udd heal --error "msg" --decision repair_once # 完整自愈流程
udd issue-draft --error "msg" [--out f.md]    # 生成 issue 草稿
udd contribute-draft --summary "fix" [--out]  # 生成贡献草稿
udd state [--json]                            # 查看持久化状态
udd audit [--limit 20] [--json]              # 查看审计记录
```

## Runtime API

```ts
runtime.check(adapter)           // 检查上游 + changelog-error 匹配
runtime.analyze(adapter)         // 诊断 incident
runtime.planHeal(adapter)        // 预览自愈计划
runtime.heal(adapter)            // 执行完整自愈闭环
runtime.watch(adapter, options)  // 后台健康监控
runtime.events.on(event, fn)     // 订阅事件
runtime.getState(adapter)        // 读取持久化状态
runtime.getAudit(adapter)        // 读取审计记录
```

## Adapter 接口

Adapter 负责把宿主环境翻译成 UDD 能理解的上下文。除 `getContext` 外全部可选：

```ts
import { defineAdapter } from "udd-kit/adapter";

const adapter = defineAdapter({
  name: "my-app",
  getContext: () => ({ cwd, appName, error, confirm }),

  // 可选：LLM 语义匹配（agent 环境）
  matchUpstreamFix: (req) => /* 对比 req.error 和 req.highlights */,

  // 可选：让 agent 在隔离 worktree 中修复代码
  invokeRepairAgent: (req) => /* return { ok, summary, changedFiles } */,

  // 可选：提供更新策略
  getUpdateProviders: () => [/* update-kit, host-native, manual */],

  // 可选：自定义决策逻辑
  decide: (prompt) => /* return UddDecision */,
});
```

## 文档

- [集成指南](./docs/INTEGRATION.md) -- 代码集成详细说明
- [Agent 指令模板](./docs/AGENT_INSTRUCTIONS.md) -- 提示词集成参考
- [UDD 设计理念](./docs/UDD-DESIGN-PHILOSOPHY.zh-CN.md)

## 设计理念

> 软件演进不应停留在"用户反馈，公司决定"的单向模式，而应转向"用户决定方向，Agent 执行建造，平台负责边界治理"的新范式。

## License

MIT
