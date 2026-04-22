<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](../README.md#multi-platform)

> ⚠️ Este documento es una **traducción resumida**. La fuente canónica del contrato actual es el [README en inglés](../README.md), y también debes tomarlo como referencia para los ejemplos detallados y la terminología más reciente.

<br clear="left" />

> **Estado:** 0.3.0

## Resumen actual

- `harness-loom` es un plugin de fábrica que instala un harness de runtime en un repositorio objetivo y lo amplía gradualmente con pairs producer-reviewer específicos del proyecto.
- La superficie canónica de authoring es `.harness/loom/`. `.claude/`, `.codex/` y `.gemini/` se derivan desde ahí con `node .harness/loom/sync.ts --provider <list>`.
- El estado de runtime vive en `.harness/cycle/`. El orchestrator se ejecuta como un DFA de cuatro estados: `Planner | Pair | Finalizer | Halt`.
- El trabajo de fin de ciclo no se modela como un pair sin reviewer, sino como el **singleton `harness-finalizer`**.
- Todo pair creado con `/harness-pair-dev` debe tener al menos un reviewer. Los workflows reviewer-less no entran en el pair roster.

## Comandos principales

- `/harness-auto-setup [<target>] [--provider <list>]`
  Configura por primera vez el proyecto objetivo o actualiza un harness existente después de tomar un snapshot.
- `/harness-init [<target>]`
  Instala o reinicia el runtime base de `.harness/loom/` y `.harness/cycle/` dentro del proyecto objetivo.
- `node .harness/loom/sync.ts --provider claude,codex,gemini`
  Despliega el canonical staging hacia los árboles de plataforma necesarios.
- `/harness-pair-dev --add <slug> "<purpose>" [--from <existing-pair>] [--reviewer <slug> ...]`
  Usa sólo un pair actualmente registrado como overlay source de `--from` y crea el nuevo pair en `.harness/loom/` preservando el conocimiento compatible sobre el template actual.
- `/harness-pair-dev --improve <slug> "<purpose>"`
  Mejora un pair registrado usando el purpose posicional como eje principal.
- `/harness-pair-dev --remove <slug>`
  Rechaza la eliminación si el ciclo activo referencia ese pair, conserva el historial de `.harness/cycle/` y elimina sólo archivos loom propios del pair.
- `/harness-orchestrate <file.md>`
  Ejecuta el orchestrator de runtime en el proyecto objetivo.

Los cambios de `/harness-pair-dev` escriben sólo en `.harness/loom/`. Después de add/improve/remove, vuelve a ejecutar `node .harness/loom/sync.ts --provider <list>` para refrescar los árboles de plataforma.

## Dónde seguir leyendo

- Instalación completa, quickstart y conceptos: [README en inglés](../README.md)
- Cambios de esta versión: [CHANGELOG](../CHANGELOG.md)
- Guía de contribución: [CONTRIBUTING.md](../CONTRIBUTING.md)
