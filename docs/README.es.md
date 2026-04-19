<img src="../assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#multiplataforma)

**Construye un harness orientado a producción sobre el harness genérico que ya traen los asistentes de código modernos.**

<br clear="left" />

> **Estado:** 0.1.1 — primera versión pública. La superficie pública todavía puede cambiar antes de 1.0; revisa el [CHANGELOG](../CHANGELOG.md) para ver cambios importantes.

`harness-loom` es un plugin de fábrica que instala un harness de ejecución en un repositorio de destino y lo va ampliando pair a pair.

Los asistentes modernos ya no son solo “un modelo más un prompt”. También incorporan un harness genérico —planners, hooks, subagentes, skills, enrutamiento de herramientas, flujo de control— que decide cómo se planifica, se delega, se revisa y se retoma el trabajo. Esa capa aporta mucho valor, pero no conoce tu sistema de producción: qué revisiones importan de verdad, qué artefactos deben persistir, cómo conviene descomponer el trabajo o dónde están tus límites de autoridad.

Cuando el modelo que has elegido ya es suficientemente capaz como para producir trabajo de calidad de producción, el principal punto de apalancamiento deja de ser el modelo y pasa a ser la **ingeniería del harness**. Es decir, convertir los estándares de revisión, las formas de las tareas y la definición de “hecho” de tu repositorio en infraestructura versionada, en vez de reexplicarlo en cada sesión. `harness-loom` trata de afinado del harness, no de afinado del modelo.

`harness-loom` está pensado para equipos que ya ven potencial de producción en su stack de asistentes y ahora quieren que se comporte como un sistema, no como una sesión aislada.

Este repositorio es la fábrica. Siembra en el repositorio de destino un harness de ejecución formado por:

- un planner y un orchestrator
- un plano de control compartido bajo `.harness/`
- un contexto de ejecución común para todos los subagentes
- pairs producer-reviewer específicos del proyecto que vas añadiendo con el tiempo

`.claude/` es la fuente canónica. `.codex/` y `.gemini/` se derivan de ella cuando hace falta.

## Por qué tiene esta forma

- **Primero skill, luego agent.** La metodología compartida vive en un `SKILL.md` por pair, así que las reglas de producción y de revisión se mantienen alineadas.
- **Producer más reviewer.** Un pair puede ampliarse a uno o varios reviewers, cada uno evaluando un eje distinto.
- **Una sola fuente canónica.** El harness se escribe en `.claude/`; `.codex/` y `.gemini/` solo se derivan cuando los necesitas.
- **Ejecución guiada por hooks.** El orchestrator escribe el siguiente dispatch en `.harness/state.md`, y los hooks reanudan el ciclo sin trabajo manual adicional.
- **Authoring anclado al repositorio.** La generación de pairs lee el código real del proyecto objetivo, así que puede citar archivos y patrones concretos en lugar de generar boilerplate abstracto.

## Qué se instala

Cuando ejecutas `/harness-init` dentro de un repositorio de destino, `harness-loom` instala un harness de ejecución, no una plantilla de prompt de un solo uso.

```text
target project
├── .harness/
│   ├── state.md
│   ├── events.md
│   ├── hook.sh
│   └── epics/
├── .claude/
│   ├── agents/
│   │   └── harness-planner.md
│   ├── skills/
│   │   ├── harness-orchestrate/
│   │   ├── harness-planning/
│   │   └── harness-context/
│   └── settings.json
└── pairs producer/reviewer específicos del proyecto
```

Después puedes añadir pairs específicos del dominio con `/harness-pair-dev` y, si lo necesitas, derivar árboles específicos para Codex o Gemini con `/harness-sync`.

## Requisitos

- **Node.js ≥ 22.6** — los scripts se ejecutan mediante TypeScript stripping nativo; no hay paso de build ni `package.json`.
- **git** — la creación de pairs se apoya en el historial de git para el rollback de `--split`.
- **Al menos un CLI de asistente compatible**, ya autenticado:
  - [Claude Code](https://code.claude.com/docs) — plataforma principal; `.claude/` es la fuente canónica.
  - [Codex CLI](https://developers.openai.com/codex/cli) — árbol derivado mediante `/harness-sync --provider codex`.
  - [Gemini CLI](https://geminicli.com/docs/) — árbol derivado mediante `/harness-sync --provider gemini`.

## Instalación

### Claude Code

```bash
claude plugin add /path/to/harness-loom
```

O desde el marketplace dentro de una sesión de Claude Code:

```text
/plugin marketplace add /path/to/harness-loom
/plugin install harness-loom@harness-loom
```

### Codex CLI

Checkout local:

```bash
codex marketplace add /path/to/harness-loom
```

Repositorio git público:

```bash
codex marketplace add https://github.com/KingGyuSuh/harness-loom.git
```

Luego abre la entrada de `Harness Loom` en el marketplace e instala el plugin.

### Gemini CLI

Gemini consume el mismo árbol de plugins mediante `.agents/plugins/marketplace.json`. Después de añadir este repositorio como fuente del marketplace en Gemini, instala `Harness Loom`.

## Inicio rápido

```bash
cd your-project
claude

# 1) instalar la base canónica
/harness-init

# 2) definir el objetivo de este ciclo
echo "Publicar un juego ligero de Snake en terminal con curses" > goal.md

# 3) añadir pairs específicos del proyecto
/harness-pair-dev --add game-design --purpose "Especificar las funcionalidades y casos límite de snake.py"
/harness-pair-dev --add impl --purpose "Implementar snake.py conforme a la especificación" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 4) opcionalmente derivar Codex / Gemini desde la base canónica .claude/
/harness-sync --provider codex,gemini

# 5) ejecutar el harness de runtime
/harness-orchestrate goal.md
```

Las salidas se guardan en `.harness/epics/EP-N--<slug>/{tasks,reviews}/`. El estado de ejecución vive en `.harness/state.md` y el registro de eventos en `.harness/events.md`.

## Conceptos clave

Hay varios términos que aparecen una y otra vez en comandos, archivos y estados. Con estos seis basta para seguir el resto del repositorio:

- **Harness** — la capa persistente alrededor del asistente: archivos de estado, hooks, subagentes y contratos. `harness-loom` adapta esa capa a tu repositorio.
- **Pair** — un **producer** más uno o varios **reviewers** que comparten un único `SKILL.md`. Es la unidad base de authoring del trabajo de dominio.
- **Producer** — el subagente que hace el trabajo de una tarea (código, especificaciones, análisis) y propone el siguiente paso.
- **Reviewer** — el subagente que evalúa la salida del producer según un eje concreto, como calidad de código, ajuste a la especificación o seguridad.
- **EPIC / Task** — un EPIC es una unidad de resultado emitida por el planner; un Task es una única ronda producer-reviewer dentro de ese EPIC. Los artefactos se guardan bajo `.harness/epics/EP-N--<slug>/{tasks,reviews}/`.
- **Orchestrator vs Planner** — el **orchestrator** controla `.harness/state.md` y despacha exactamente un pair por respuesta. El **planner** opera dentro de ese ciclo y descompone el objetivo en EPICs con sus rosters.

## Comandos

| Comando | Propósito |
|---------|---------|
| `/harness-init [<target>] [--force]` | Construye la base canónica `.claude/` dentro de un proyecto de destino. Escribe `.harness/`, los skills de runtime, el agent `harness-planner` y la configuración de hooks. |
| `/harness-sync [--provider <list>]` | Deriva `.codex/` y `.gemini/` a partir de la base canónica `.claude/`. Es una sincronización en un solo sentido; nunca reescribe `.claude/`. |
| `/harness-pair-dev --add <slug> --purpose "<text>" [--reviewer <slug> ...]` | Crea un nuevo pair producer-reviewer apoyado en el código actual. Repite `--reviewer` para una topología 1:N de reviewers. |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | Reaudita un pair existente según la rúbrica y el estado actual del código, y luego lo mejora. |
| `/harness-pair-dev --split <slug>` | Divide un pair demasiado grande en dos pairs más acotados. |
| `/harness-orchestrate <goal.md>` | Punto de entrada del runtime en el repositorio objetivo. Lee el objetivo, despacha un pair por respuesta y avanza el ciclo mediante la reentrada del hook. |

## Fábrica y runtime

```text
factory (este repositorio)                       target project
-----------------------------------------      ----------------------------------
skills/harness-init/          instala ->       .harness/{state,events,hook,epics}/
skills/harness-pair-dev/      escribe ->       .claude/agents/<slug>-producer.md
skills/harness-sync/          deriva  ->       .claude/agents/<reviewer>.md
skills/harness-init/references/runtime/ siembra -> .claude/skills/<slug>/SKILL.md
                                               .claude/settings.json
                                                     |
                                                     +-- /harness-sync (opcional)
                                                         -> .codex/
                                                         -> .gemini/
```

Esta separación es deliberada:

- la fábrica se mantiene pequeña y puede ser invocada directamente por el usuario
- el runtime del proyecto guarda el estado de trabajo específico de ese repositorio
- los árboles específicos de cada proveedor son artefactos derivados, no superficies de authoring

## Multiplataforma

Los pines de plataforma que aplica `sync.ts` son los siguientes:

| Plataforma | Modelo | Evento de hook | Notas |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` dispara `.harness/hook.sh`. |
| Codex | `gpt-5.4`, `model_reasoning_effort: xhigh` | `Stop` | Los subagentes no usan modelos mini. |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | Los skills se reflejan en el árbol de la plataforma. |

## Cuándo conviene usarlo

Usa `harness-loom` cuando:

- el entorno base del asistente ya sea suficientemente capaz para hacer trabajo real en tu repositorio
- la brecha que queda sea de repetibilidad, estructura de revisión, continuidad del estado y ajuste al dominio
- quieras que las reglas del harness vivan en archivos versionados en lugar de volver a indicarlas ad hoc cada vez
- quieras una única superficie canónica de authoring con derivación multiplataforma determinista

No es la herramienta adecuada si todavía estás evaluando si la pila de modelos subyacente puede manejar tu trabajo. Este proyecto parte de la base de que el harness genérico ya resulta útil y se centra en convertirlo en un sistema realmente orientado a producción.

## Contribuir

Se agradecen issues, correcciones de errores y mejoras de la rúbrica. Consulta [CONTRIBUTING.md](../CONTRIBUTING.md) para ver el flujo de desarrollo, los comandos de smoke test y la guía de alcance. Si quieres proponer nuevos skills invocables por el usuario o cambios en el ritmo del orchestrator, lo mejor es abrir primero una discusión. Para reportes de seguridad, revisa [SECURITY.md](../SECURITY.md). Toda participación se rige por el [Code of Conduct](../CODE_OF_CONDUCT.md).

## Documentos del proyecto

- [CHANGELOG.md](../CHANGELOG.md) - historial de lanzamientos
- [CONTRIBUTING.md](../CONTRIBUTING.md) - entorno de desarrollo y flujo de PR
- [SECURITY.md](../SECURITY.md) - divulgación responsable
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - expectativas de la comunidad
- [LICENSE](../LICENSE) - MIT
