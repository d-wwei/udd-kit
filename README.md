# UDD Kit

`UDD Kit` 是 `User Directed Development Toolkit` 的实现。它是一个可嵌入到 skill、agent、CLI 工具或小型程序里的通用层，用来处理三件事：

- 检查 GitHub 仓库更新，并向用户提示升级
- 采集错误、日志和环境信息，生成脱敏 issue 草稿
- 识别本地修复，生成分支、commit、PR 草稿并在确认后提交
- 编排自愈流程：诊断、Agent 修复、可选 Update Provider、验证、PR / issue 分流

核心设计原则只有一句话：

**宿主接入一次，UDD Kit 持续升级；新增能力优先通过 runtime 和 manifest 演进，而不是要求宿主重写集成。**

## Architecture

`UDD Kit` 现在分成两层：

- `adapter`
  宿主项目写的一层超薄翻译层，只负责把自己的运行时上下文暴露给 UDD
- `runtime`
  UDD Kit 自己持续进化的能力层，负责更新检查、issue/PR 草稿、GitHub 提交

## Install

```bash
npm install udd-kit
```

## Manifest

默认配置文件名：

- `udd.config.json`

兼容旧文件名：

- `agent-upgrade.json`

可以从 [udd.config.example.json](/Users/eli/Documents/自动升级/udd.config.example.json) 开始。

## Minimal Node/TS Example

```ts
import { defineAdapter } from "udd-kit/adapter";
import { createRuntime } from "udd-kit/runtime";

const adapter = defineAdapter({
  name: "my-skill",
  async getContext() {
    return {
      cwd: process.cwd(),
      appName: "my-skill",
      logs: ["./logs/latest.log"],
      confirm: async (prompt) => {
        console.log(prompt.title);
        return true;
      }
    };
  }
});

const runtime = await createRuntime({ cwd: process.cwd() });
const update = await runtime.check(adapter);

if (update.shouldNotify) {
  console.log(update.message);
}
```

## CLI

```bash
udd check --manifest ./udd.config.json
udd analyze --manifest ./udd.config.json --error "Request failed"
udd heal --manifest ./udd.config.json --error "Request failed" --decision repair_once
udd state --manifest ./udd.config.json
udd audit --manifest ./udd.config.json --limit 20
udd issue-draft --manifest ./udd.config.json --error "Request failed" --log ./logs/latest.log
udd contribute-draft --manifest ./udd.config.json --summary "Fixed retry loop"
udd ignore --manifest ./udd.config.json --version 1.2.3
```

兼容旧命令：

```bash
agent-upgrade check --manifest ./agent-upgrade.json
```

## Public Modules

- `udd-kit`
  兼容入口，导出全部核心方法
- `udd-kit/adapter`
  适合宿主接入，只暴露稳定 adapter 接口
- `udd-kit/runtime`
  适合宿主调用的 runtime 类和工厂方法

## Self-Healing APIs

- `runtime.analyze(adapter)`
  诊断 incident 并给出建议修复策略
- `runtime.planHeal(adapter)`
  生成自愈计划，包括策略和可选 Update Provider
- `runtime.heal(adapter)`
  执行完整自愈闭环，并产出 repaired / escalated / skipped 结果
- `runtime.getState(adapter)` / `runtime.getAudit(adapter)`
  查询持久状态和审计记录

## Integration Guide

其他 skill 或项目的接入说明见 [docs/INTEGRATION.md](/Users/eli/Documents/自动升级/docs/INTEGRATION.md)。

## Notes

- GitHub 写操作仍然默认要求用户确认
- 默认缓存仍保存在 `~/.agent-upgrade-kit/cache.json`
- 新能力优先通过 runtime 演进，宿主只需要保持 adapter 稳定
