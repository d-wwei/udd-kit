# UDD Kit -- Agent Prompt Integration Template

> 将以下内容嵌入你的产品的 agent 指令（如 AGENT_INSTRUCTIONS.md、CLAUDE.md、system prompt），
> agent 就会在遇到问题时自动派生 subagent 运行 UDD 自愈流程。
> 不需要写任何代码。

## 嵌入方式

将下面 `---` 之间的内容复制到你产品的 agent 指令文件中，替换 `{{PRODUCT_ROOT}}` 为产品的实际路径。

---

## Self-Healing Protocol (UDD)

This project uses UDD Kit for self-healing. When you encounter a failure while using this product, follow this protocol:

### When to trigger

- A tool or command from this product fails with an error
- A previously working workflow stops working after an update
- You see version mismatch, dependency, or compatibility errors

### What to do

**Spawn a separate subagent** to handle diagnosis and repair. Do NOT attempt UDD operations in your current context -- use an isolated subagent to avoid recursive dependency (you may be part of the product being repaired).

The subagent should:

1. **Check if upstream already fixed the problem:**

```bash
cd {{PRODUCT_ROOT}} && udd check --json
```

Read the JSON output. If `hasUpdate` is true, check `upstreamFixMatch` -- if present with medium/high confidence, the upstream release likely fixes this error. Recommend the user to update.

2. **If no upstream fix, analyze the error:**

```bash
cd {{PRODUCT_ROOT}} && udd analyze --error "<error message>" --json
```

Read the `diagnosis` from JSON output. Report the classification (`kind`) and suggested strategies to the user.

3. **If the user approves repair, attempt self-heal:**

```bash
cd {{PRODUCT_ROOT}} && udd heal --error "<error message>" --decision repair_once --json
```

This runs in an isolated git worktree. If verification passes, the fix is ready for review.

4. **If repair fails, draft an issue:**

```bash
cd {{PRODUCT_ROOT}} && udd issue-draft --error "<error message>" --out ./issue-draft.md
```

Present the draft to the user for review before submission.

### Semantic matching

When analyzing whether an upstream changelog entry fixes the current error, use your own judgment as an LLM -- you are better at semantic matching than keyword overlap. Consider:
- Does the changelog mention the same component, module, or function?
- Does it describe fixing the same class of error (even with different wording)?
- Is the error pattern consistent with what the fix addresses?

Report your confidence as high/medium/low.

### Rules

- Always run UDD commands in a subagent, never in the main agent context
- Never modify files outside the product's directory
- Never commit to main/master directly
- If `udd.config.json` is missing, inform the user -- do not create one
- Respect `.env`, secrets, and paths listed in `protectedPaths`

---

## 产品维护者需要做的

1. 在项目根目录放一个 `udd.config.json`（运行 `udd init` 自动生成）
2. 把上面的 Self-Healing Protocol 段落嵌入你的 agent 指令文件
3. 确保 `udd` CLI 已全局安装（`npm install -g udd-kit`）

就这些。不需要写 adapter，不需要写代码，不需要事件订阅。

## 这为什么比代码集成更好

| | 代码集成 | Prompt 集成 |
|---|---|---|
| 工作量 | 写 adapter + 配 manifest + 接事件 | 复制一段提示词 + 放 config |
| 语义匹配 | 文本 token 重叠 (粗糙) | Agent 自身的 LLM 能力 (精确) |
| 递归依赖 | 需要单独处理 | Subagent 天然隔离 |
| 适用范围 | Node.js/TypeScript 项目 | 任何有 agent 的环境 |
| 维护成本 | 升级 SDK 版本 | 零 (CLI 升级即可) |

## 什么时候仍然需要代码集成

- CI/CD 管道（没有 agent 在运行）
- 后台定时健康检查（`runtime.watch()`）
- 需要程序化处理事件的场景
- 嵌入到 Web 服务的中间件

这些场景用 `initUdd()` programmatic API。
