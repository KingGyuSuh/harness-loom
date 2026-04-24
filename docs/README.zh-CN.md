<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.3.2-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](../README.md#multi-platform)

> ⚠️ 本文档是**精简翻译版**。当前契约的权威来源是 [English README](../README.md)，详细示例和最新表述也以它为准。

<br clear="left" />

> **状态：** 0.3.2

## 当前要点

- `harness-loom` 是一个工厂型插件：它会把运行时 harness 安装到目标仓库里，并逐步增加项目专用的 producer-reviewer pair。
- 正本 authoring surface 是 `.harness/loom/`。`.claude/`、`.codex/`、`.gemini/` 都通过 `node .harness/loom/sync.ts --provider <list>` 从这里派生。
- 运行时状态存放在 `.harness/cycle/`。orchestrator 按 `Planner | Pair | Finalizer | Halt` 四状态 DFA 运行。
- cycle-end 工作不是 reviewer-less pair，而是由**singleton `harness-finalizer`** 负责。
- 通过 `/harness-pair-dev` 添加的 pair 必须至少包含一名 reviewer。reviewer-less workflow 不进入 pair roster。

## 关键命令

- `/harness-auto-setup [--setup | --migration] [--provider <list>]`
  安全地对当前工作目录的 harness 进行设置、增强或迁移。`--setup`（默认）用于 fresh target bootstrap 或现有 harness 的 intentional improvement，`--migration` 用于对现有 harness 做 snapshot-first minimal-delta 升级。
- `/harness-init`
  在当前工作目录中安装或重置基于 `.harness/loom/` 与 `.harness/cycle/` 的基础运行时。
- `node .harness/loom/sync.ts --provider claude,codex,gemini`
  将 canonical staging 部署到所需的平台树。
- `/harness-pair-dev --add <slug> "<purpose>" [--from <source>] [--reviewer <slug> ...]`
  `--from` 接受当前已注册的 live pair slug，或 target-local `snapshot:<ts>/<pair>` / `archive:<ts>/<pair>` locator 作为 overlay source，在最新 template 上保留兼容的原始知识并写入 `.harness/loom/`。
- `/harness-pair-dev --improve <slug> "<purpose>"`
  以 positional purpose 为主轴改进已注册的 pair。
- `/harness-pair-dev --remove <slug>`
  如果 active cycle 正在引用该 pair 就拒绝删除，保留 `.harness/cycle/` history，只安全移除 pair-owned loom 文件。
- `/harness-orchestrate <file.md>`
  运行目标侧的 runtime orchestrator。

`/harness-pair-dev` 的变更只写入 `.harness/loom/`。add/improve/remove 后，请重新运行 `node .harness/loom/sync.ts --provider <list>` 刷新平台树。

## 继续阅读

- 安装流程、quickstart、概念说明: [English README](../README.md)
- 本次发布的变化: [CHANGELOG](../CHANGELOG.md)
- 贡献指南: [CONTRIBUTING.md](../CONTRIBUTING.md)
