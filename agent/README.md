# `~/.pi/agent/` — custom skills & prompts

This directory holds locally-installed pi **skills** (`~/.pi/agent/skills/`, auto-discovered — any directory with a `SKILL.md` is loaded; see pi's `docs/skills.md`) and **prompts** (`~/.pi/agent/prompts/*.md`, expanded by typing `/name`; see `docs/prompt-templates.md`).

## mattpocock/skills

**Source**: https://github.com/mattpocock/skills  
**Installed**: static copies (no git repo, not auto-updating)

Composable engineering discipline skills adapted to pi. Split on invocation:

- **User-invoked** (`disable-model-invocation: true`) — zero context pollution; fire only via `/skill:<name>`. All but `tdd` and `diagnosing-bugs` below.
- **Model-invoked** — the agent auto-loads them when a task fits, at the cost of a short description sitting in the system prompt every turn. Only `tdd` and `diagnosing-bugs` below.

### Skills

- **grilling** (user) — the relentless interview loop behind every `grill-*` skill. Reached explicitly by `grill-with-docs` and `improve-codebase-architecture`; your `/grill-me` prompt covers the direct, no-codebase case.
- **grill-with-docs** (user) — `grilling` + `domain-modeling` together. The entry point when you have a codebase: sharpens a plan and writes `CONTEXT.md`/ADRs as decisions land.
- **domain-modeling** (user) — actively builds and sharpens a project's domain model; challenges terms, writes `CONTEXT.md` and ADRs inline. Reached by `grill-with-docs` and `improve-codebase-architecture`.
- **codebase-design** (user) — deep-module design vocabulary (module, interface, depth, seam, adapter, leverage, locality). Reached by `tdd` and `improve-codebase-architecture`.
- **tdd** (model) — red-green-refactor, one vertical slice at a time. Auto-fires on test-first work.
- **diagnosing-bugs** (model) — reproduce → minimise → hypothesise → instrument → fix → regression-test. Auto-fires on "debug this" / something broken.
- **improve-codebase-architecture** (user) — scans the codebase for deepening opportunities, writes a visual HTML report to the OS temp dir, then grills through whichever one you pick.
- **prototype** (user) — throwaway code that answers a question: a terminal app for state/logic, or multiple UI variations on one route.
- **writing-great-skills** (user) — reference for writing and editing skills well. Links to its sibling `GLOSSARY.md`.

### Prompts (in `~/.pi/agent/prompts/`, not skills)

- `/grill-me` — stateless grilling when there's no codebase (you had this before this install).
- `/handoff` — compacts the current conversation into a temp-file handoff doc for a fresh agent.

### Notes

- Sibling files (`GLOSSARY.md`, `DEEPENING.md`, `scripts/hitl-loop.template.sh`, etc.) live inside each skill dir so relative-path links resolve.
- `disable-model-invocation: true` was added to `grilling`, `domain-modeling`, and `codebase-design` so they stay zero-pollution while remaining reachable by other skills (the agent `read`s them on demand).
- Deliberately **not installed** (require per-repo config from `setup-matt-pocock-skills`, which was skipped): `to-prd`, `to-issues`, `triage`, `implement`, `ask-matt`, `setup-matt-pocock-skills`. Also skipped: Claude-Code-only (`git-guardrails-claude-code`) and TS/Husky/course-specific (`migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`).
- To refresh (if ever wanted): re-clone https://github.com/mattpocock/skills, re-copy the dirs above into `~/.pi/agent/skills/`, and re-add `disable-model-invocation: true` to the three skills listed in Notes.
