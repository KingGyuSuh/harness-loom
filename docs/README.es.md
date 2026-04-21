<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.2-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](../README.md#multi-platform)

> ⚠️ Este documento es una **traducción resumida**. La fuente canónica del contrato actual es el [README en inglés](../README.md), y también debes tomarlo como referencia para los ejemplos detallados y la terminología más reciente.

<br clear="left" />

> **Estado:** 0.2.2

## Resumen actual

- `harness-loom` es un plugin de fábrica que instala un harness de runtime en un repositorio objetivo y lo amplía gradualmente con pairs producer-reviewer específicos del proyecto.
- La superficie canónica de authoring es `.harness/loom/`. `.claude/`, `.codex/` y `.gemini/` se derivan desde ahí con `node .harness/loom/sync.ts --provider <list>`.
- El estado de runtime vive en `.harness/cycle/`. El orchestrator se ejecuta como un DFA de cuatro estados: `Planner | Pair | Finalizer | Halt`.
- El trabajo de fin de ciclo no se modela como un pair sin reviewer, sino como el **singleton `harness-finalizer`**.
- Todo pair creado con `/harness-pair-dev` debe tener al menos un reviewer. Los workflows reviewer-less no entran en el pair roster.

## Comandos principales

- `/harness-init [<target>]`
  Instala el runtime basado en `.harness/loom/` y `.harness/cycle/` dentro del proyecto objetivo.
- `node .harness/loom/sync.ts --provider claude,codex,gemini`
  Despliega el canonical staging hacia los árboles de plataforma necesarios.
- `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug> ...]`
  Crea un nuevo pair producer-reviewer basado en el código actual.
- `/harness-pair-dev --improve <slug> [--hint "<text>"]`
  Mejora un pair existente apoyándose en evidencia real del repositorio.
- `/harness-pair-dev --split <slug>`
  Divide un pair demasiado amplio en dos pairs más estrechos.
- `/harness-orchestrate <goal.md>`
  Ejecuta el orchestrator de runtime en el proyecto objetivo.

## Dónde seguir leyendo

- Instalación completa, quickstart y conceptos: [README en inglés](../README.md)
- Cambios de esta versión: [CHANGELOG](../CHANGELOG.md)
- Guía de contribución: [CONTRIBUTING.md](../CONTRIBUTING.md)
