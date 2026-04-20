<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#multiplataforma)

**Construye un harness orientado a producción sobre el harness genérico que ya traen los asistentes de código modernos.**

<br clear="left" />

> **Estado:** 0.2.0 — primera versión pública. La superficie pública todavía puede cambiar antes de 1.0; revisa el [CHANGELOG](../CHANGELOG.md) para ver cambios importantes.

`harness-loom` es un plugin de fábrica que instala un harness de ejecución en un repositorio de destino y lo va ampliando pair a pair.

Los asistentes modernos ya no son solo “un modelo más un prompt”. También incorporan un harness genérico —planners, hooks, subagentes, skills, enrutamiento de herramientas, flujo de control— que decide cómo se planifica, se delega, se revisa y se retoma el trabajo. Esa capa aporta mucho valor, pero no conoce tu sistema de producción: qué revisiones importan de verdad, qué artefactos deben persistir, cómo conviene descomponer el trabajo o dónde están tus límites de autoridad.

Cuando el modelo que has elegido ya es suficientemente capaz como para producir trabajo de calidad de producción, el principal punto de apalancamiento deja de ser el modelo y pasa a ser la **ingeniería del harness**. Es decir, convertir los estándares de revisión, las formas de las tareas y la definición de “hecho” de tu repositorio en infraestructura versionada, en vez de reexplicarlo en cada sesión. `harness-loom` trata de afinado del harness, no de afinado del modelo.

`harness-loom` está pensado para equipos que ya ven potencial de producción en su stack de asistentes y ahora quieren que se comporte como un sistema, no como una sesión aislada.

Este repositorio es la fábrica. Siembra en el repositorio de destino un harness de ejecución formado por:

- un planner y un orchestrator
- un plano de control compartido bajo `.harness/`
- un contexto de ejecución común para todos los subagentes
- pairs producer-reviewer específicos del proyecto que vas añadiendo con el tiempo

El `.harness/` del proyecto objetivo se divide en dos namespaces hermanos: `loom/` es el árbol canónico de staging que pertenece a install y sync, y `cycle/` contiene el estado de runtime que pertenece al orchestrator. La documentación del proyecto vive directamente en el proyecto objetivo (raíz `*.md`, `docs/`), no dentro de `.harness/`. Los árboles de plataforma (`.claude/`, `.codex/`, `.gemini/`) se derivan de `.harness/loom/` cuando hacen falta.

## Por qué tiene esta forma

- **Primero skill, luego agent.** La metodología compartida vive en un `SKILL.md` por pair, así que las reglas de producción y de revisión se mantienen alineadas.
- **Producer más reviewer.** Un pair puede ampliarse a uno o varios reviewers, cada uno evaluando un eje distinto.
- **Una sola fuente canónica.** El harness se escribe en `.harness/loom/`; `.claude/`, `.codex/` y `.gemini/` solo se derivan cuando los necesitas.
- **Ejecución guiada por hooks.** El orchestrator escribe el siguiente dispatch en `.harness/cycle/state.md`, y los hooks reanudan el ciclo sin trabajo manual adicional.
- **Authoring anclado al repositorio.** La generación de pairs lee el código real del proyecto objetivo, así que puede citar archivos y patrones concretos en lugar de generar boilerplate abstracto.

## Qué se instala

Cuando ejecutas `/harness-init` dentro de un repositorio de destino, `harness-loom` instala un harness de ejecución, no una plantilla de prompt de un solo uso.

```text
target project
└── .harness/
    ├── loom/                    # staging canónico (install + sync)
    │   ├── skills/
    │   │   ├── harness-orchestrate/
    │   │   ├── harness-planning/
    │   │   ├── harness-context/
    │   │   └── harness-doc-keeper/
    │   ├── agents/
    │   │   ├── harness-planner.md
    │   │   └── harness-doc-keeper-producer.md
    │   ├── hook.sh
    │   └── sync.ts
    ├── cycle/                   # estado de runtime (orchestrator)
    │   ├── state.md
    │   ├── events.md
    │   └── epics/
    └── _archive/                # ciclos anteriores; se crea al hacer reset por goal-different
```

La documentación del proyecto (raíz `*.md`, `docs/`) se almacena **directamente en el proyecto objetivo**, fuera de `.harness/`. A continuación deriva al menos un árbol de plataforma con `node .harness/loom/sync.ts --provider claude` (añade `codex,gemini` si es multiplataforma) y luego añade pairs específicos del dominio con `/harness-pair-dev`. El `harness-doc-keeper` integrado es un producer sin reviewer que se dispara automáticamente al final de cada ciclo, lee el proyecto + goal + actividad del ciclo y autora/evoluciona la documentación que este proyecto realmente necesita (`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/design-docs/`, `docs/product-specs/`, `docs/exec-plans/`, etc. — solo el subconjunto que la evidencia del proyecto justifica). No lo invocas directamente; el orchestrator lo despacha como último turno sin reviewer antes de detenerse.

## Requisitos

- **Node.js ≥ 22.6** — los scripts se ejecutan mediante TypeScript stripping nativo; no hay paso de build ni `package.json`.
- **git** — la creación de pairs se apoya en el historial de git para el rollback de `--split`.
- **Al menos un CLI de asistente compatible**, ya autenticado:
  - [Claude Code](https://code.claude.com/docs) — plataforma principal; el staging canónico `.harness/loom/` se deriva a `.claude/` mediante `node .harness/loom/sync.ts --provider claude`.
  - [Codex CLI](https://developers.openai.com/codex/cli) — se deriva a `.codex/` mediante `node .harness/loom/sync.ts --provider codex`.
  - [Gemini CLI](https://geminicli.com/docs/) — se deriva a `.gemini/` mediante `node .harness/loom/sync.ts --provider gemini`.

## Instalación

La fábrica se distribuye con el layout monorepo estándar `plugins/<name>/`: la raíz del repositorio contiene `.claude-plugin/marketplace.json` y `.agents/plugins/marketplace.json`, y el árbol real del plugin vive bajo `plugins/harness-loom/`. La fábrica se usa desde Claude Code o Codex CLI, y dentro del proyecto objetivo se derivan los árboles de plataforma que hagan falta.

### Claude Code

Prueba rápida local (sesión única, sin marketplace):

```bash
claude --plugin-dir ./plugins/harness-loom
```

Instalación persistente desde el marketplace dentro de la sesión de Claude Code. Checkout local:

```text
/plugin marketplace add ./
/plugin install harness-loom@harness-loom-marketplace
```

Repositorio git público (GitHub shorthand):

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

Fijar un tag específico si hace falta:

```text
/plugin marketplace add KingGyuSuh/harness-loom@<tag>
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

Añade la fuente del marketplace; el argumento apunta a la raíz del repositorio (donde está `.agents/plugins/marketplace.json`):

```bash
# checkout local
codex marketplace add /path/to/harness-loom

# repositorio git público
codex marketplace add KingGyuSuh/harness-loom

# fijar un tag si hace falta
codex marketplace add KingGyuSuh/harness-loom@<tag>
```

Después, dentro del TUI de Codex, ejecuta `/plugins`, abre la entrada `Harness Loom` del marketplace e instala el plugin.

### Gemini Runtime

Instala la fábrica desde Claude Code o Codex CLI y luego deriva `.gemini/` dentro del proyecto objetivo para ejecutar el runtime en Gemini:

1. Desde Claude Code o Codex CLI, instala la fábrica y ejecuta `/harness-init` + `node .harness/loom/sync.ts --provider gemini` dentro de tu proyecto objetivo. Esto despliega el runtime del lado del objetivo (`.harness/loom/`, `.harness/cycle/`, `.gemini/agents/`, `.gemini/skills/`, `.gemini/settings.json` con el hook `AfterAgent`).
2. Haz `cd` a ese proyecto objetivo y ejecuta `gemini`. La CLI autoflea los agents/skills/hooks workspace-scope bajo `.gemini/`.
3. Tu ciclo orchestrator corre end-to-end en Gemini — el authoring de la fábrica sigue en Claude / Codex, la ejecución puede ser en cualquiera de las tres.

## Inicio rápido

```bash
cd your-project
claude

# 1) instalar la base canónica (.harness/loom/ + .harness/cycle/)
/harness-init

# 2) derivar al menos un árbol de plataforma desde el staging canónico.
node .harness/loom/sync.ts --provider claude
#    Para multiplataforma, lista todos los providers que quieras derivar:
# node .harness/loom/sync.ts --provider claude,codex,gemini

# 3) definir el objetivo de este ciclo
echo "Publicar un juego ligero de Snake en terminal con curses" > goal.md

# 4) añadir pairs específicos del proyecto
#    `<purpose>` es el segundo argumento posicional. Tras escribirlos, vuelve a
#    ejecutar el comando sync de arriba para refrescar los árboles derivados.
/harness-pair-dev --add game-design "Especificar las funcionalidades y casos límite de snake.py"
/harness-pair-dev --add impl "Implementar snake.py conforme a la especificación" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 4a) opt-in sin reviewer para trabajo determinista / auxiliar
#     (sync, format, mirror); por defecto sigue siendo pair.
/harness-pair-dev --add asset-mirror "Copiar los activos canónicos al árbol derivado" \
  --reviewer none

# 4b) vuelve a lanzar sync para desplegar los pairs nuevos en los árboles de plataforma
node .harness/loom/sync.ts --provider claude

# 5) ejecutar el harness de runtime
/harness-orchestrate goal.md
```

Las salidas se guardan en `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`. El estado de ejecución vive en `.harness/cycle/state.md` y el registro de eventos en `.harness/cycle/events.md`. Antes de detenerse en cada ciclo, el orchestrator despacha automáticamente el producer integrado `harness-doc-keeper` sin reviewer, que lee el proyecto + goal + actividad del ciclo y autora o evoluciona la documentación del proyecto de forma quirúrgica — archivos maestros en la raíz (`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, etc.) y el subárbol `docs/` (`design-docs/`, `product-specs/`, `exec-plans/`, `generated/`, según lo que la evidencia del proyecto justifique). El contenido escrito a mano fuera de la sección de punteros se preserva byte-a-byte.

## Conceptos clave

Hay varios términos que aparecen una y otra vez en comandos, archivos y estados. Con estos seis basta para seguir el resto del repositorio:

- **Harness** — la capa persistente alrededor del asistente: archivos de estado, hooks, subagentes y contratos. `harness-loom` adapta esa capa a tu repositorio.
- **Pair** — un **producer** más uno o varios **reviewers** que comparten un único `SKILL.md`. Es la unidad base de authoring del trabajo de dominio.
- **Producer** — el subagente que hace el trabajo de una tarea (código, especificaciones, análisis) y propone el siguiente paso.
- **Reviewer** — el subagente que evalúa la salida del producer según un eje concreto, como calidad de código, ajuste a la especificación o seguridad.
- **EPIC / Task** — un EPIC es una unidad de resultado emitida por el planner; un Task es una única ronda producer-reviewer dentro de ese EPIC. Los artefactos se guardan bajo `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`.
- **Orchestrator vs Planner** — el **orchestrator** controla `.harness/cycle/state.md` y despacha exactamente un producer por respuesta (con 0, 1 o M reviewers en paralelo). El **planner** opera dentro de ese ciclo para descomponer el objetivo en EPICs, elegir para cada EPIC el tramo aplicable del roster global fijo y declarar los gates upstream por misma etapa.

## Comandos

| Comando | Propósito |
|---------|---------|
| `/harness-init [<target>] [--force]` | Construye el árbol de staging canónico `.harness/loom/` y el estado de runtime `.harness/cycle/` dentro del proyecto de destino. Escribe los skills de runtime, el agent `harness-planner`, el producer integrado `harness-doc-keeper` y las copias self-contained de `hook.sh` + `sync.ts` dentro de `.harness/loom/`. No toca ningún árbol de plataforma. |
| `node .harness/loom/sync.ts --provider <list>` | Deriva el `.harness/loom/` canónico a los árboles de plataforma (`.claude/`, `.codex/`, `.gemini/`). Es unidireccional; nunca reescribe `.harness/loom/`. Sin `--provider` cae en autodetección de los árboles de plataforma ya presentes en disco. |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | Crea un nuevo pair producer-reviewer apoyado en el código actual. `<purpose>` es el segundo argumento posicional. Repite `--reviewer` para una topología 1:N, o pasa `--reviewer none` para un grupo producer-only sin reviewer (trabajo determinista / auxiliar; el pair sigue siendo el predeterminado). El authoring solo escribe en `.harness/loom/`; vuelve a lanzar `node .harness/loom/sync.ts --provider <list>` después. |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | Reaudita un pair existente según la rúbrica y el estado actual del código, y luego lo mejora. Vuelve a lanzar sync para refrescar los árboles de plataforma. |
| `/harness-pair-dev --split <slug>` | Divide un pair demasiado grande en dos pairs más acotados. Vuelve a lanzar sync después. |
| `/harness-orchestrate <goal.md>` | Punto de entrada del runtime en el repositorio objetivo. Lee el objetivo, despacha un producer (con su conjunto de reviewers emparejados cuando aplique) por respuesta y avanza el ciclo mediante la reentrada del hook. Antes del halt, despacha automáticamente el producer integrado `harness-doc-keeper` sin reviewer y luego limpia `Next`. |

## Fábrica y runtime

```text
factory (este repositorio)                       target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          instala ->       .harness/loom/{skills,agents,hook.sh,sync.ts}
plugins/harness-loom/skills/harness-init/                            .harness/cycle/{state.md,events.md,epics/}
plugins/harness-loom/skills/harness-init/references/runtime/ siembra -> .harness/loom/skills/<slug>/SKILL.md
plugins/harness-loom/skills/harness-pair-dev/      escribe ->       .harness/loom/agents/<slug>-producer.md
                                                                    .harness/loom/agents/<reviewer>.md
                                                                    .harness/loom/skills/<slug>/SKILL.md
                                                     |
                                                     +-- node .harness/loom/sync.ts --provider <list>
                                                         -> .claude/{agents,skills,settings.json}
                                                         -> .codex/
                                                         -> .gemini/
                                                     |
                                                     +-- harness-doc-keeper se dispara en el halt del ciclo
                                                         -> CLAUDE.md / AGENTS.md (sección de punteros)
                                                         -> ARCHITECTURE.md / DESIGN.md / ...
                                                         -> docs/{design-docs,product-specs,exec-plans,generated,...}/
```

Esta separación es deliberada:

- la fábrica se mantiene pequeña y puede ser invocada directamente por el usuario
- el runtime del proyecto guarda el estado de trabajo específico de ese repositorio
- los árboles específicos de cada proveedor son artefactos derivados, no superficies de authoring

## Multiplataforma

Los pines de plataforma que aplica `sync.ts` son los siguientes:

| Plataforma | Modelo | Evento de hook | Notas |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` dispara `.harness/loom/hook.sh`. |
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
- [LICENSE](../LICENSE) - Apache 2.0
- [NOTICE](../NOTICE) - aviso de atribución requerido por Apache 2.0
