# UDD Kit Integration Guide

`UDD Kit` 的设计目标是：宿主项目接入一次，后续通过升级 `udd-kit` 版本持续获得新能力，而不是每次都重写接入逻辑。

## 1. 集成模型

宿主项目只需要负责两件事：

- 提供一个稳定的 `adapter`
- 提供一份稳定的 `udd.config.json`

`adapter` 负责把宿主环境翻译成 UDD Runtime 能理解的上下文。
`runtime` 负责更新检查、issue 草稿、贡献草稿、GitHub 提交等会持续演进的能力。

## 2. 接入文件

在宿主项目根目录新增：

- `udd.config.json`

可以从 [udd.config.example.json](/Users/eli/Documents/自动升级/udd.config.example.json) 复制。

兼容旧名字：

- `agent-upgrade.json`

## 3. Node / TypeScript 宿主

安装：

```bash
npm install udd-kit
```

最小接入：

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

const runtime = await createRuntime({
  cwd: process.cwd()
});

const result = await runtime.check(adapter);
if (result.shouldNotify) {
  console.log(result.message);
}
```

错误上报：

```ts
const issueDraft = await runtime.prepareIssue(adapter, {
  error: {
    message: err.message,
    stack: err.stack
  }
});
```

本地修复回流：

```ts
const draft = await runtime.prepareContribution(adapter, {
  summary: "fix retry loop"
});
```

## 4. Bash / Python / 其他项目

可以直接用 CLI，不需要写 JS SDK：

```bash
udd check --manifest ./udd.config.json
udd issue-draft --manifest ./udd.config.json --error "Request failed" --log ./logs/latest.log
udd contribute-draft --manifest ./udd.config.json --summary "Fix retry loop"
udd ignore --manifest ./udd.config.json --version 1.2.3
```

## 5. 稳定接入原则

为了确保“接一次、持续升级”成立，宿主应遵守这几个规则：

- 只依赖 `adapter` 和 `runtime` 的公开接口
- 不直接调用内部文件
- 把宿主特有逻辑放在 adapter 中，不写进 runtime
- manifest 字段尽量补全，新增字段允许缺省

## 6. 推荐接入点

- 启动时：`runtime.check(adapter)`
- 捕获错误时：`runtime.prepareIssue(adapter, ...)`
- 用户修好问题后：`runtime.prepareContribution(adapter, ...)`
- 需要统一调度时：`runtime.run(adapter, hooks)`

## 7. 升级策略

宿主项目未来升级 `udd-kit` 时，优先只做依赖版本升级：

```bash
npm update udd-kit
```

如果没有新增宿主必填能力，就不需要改宿主接入代码。
