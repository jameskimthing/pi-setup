---
name: repo-map
description: Maintain REPO-MAP.md — a shared, lazily-updated structural map of the project so subagents skip re-deriving architecture. Use when a scout finishes recon, or when an area's structure/conventions/boundaries crystallise during a task.
disable-model-invocation: true
---

# Repo Map

Maintain a shared structural map of the project so every fresh-context
subagent doesn't re-grep and re-derive the same architecture. This is the
*passive* discipline — the file is read at dispatch time, not debated. (The
active discipline — *designing* the structure — is `codebase-design`. This
skill is for recording what's there, not deciding what should be.)

The file is **`REPO-MAP.md`** at the repo root. It complements, never
duplicates:

- `AGENTS.md` — how agents should *behave* (guidelines).
- `CONTEXT.md` (domain-modeling) — what terms *mean* (glossary).
- `REPO-MAP.md` (this skill) — *where things are and how they connect*
  (structure).

## File structure

Single `REPO-MAP.md` at repo root. If the repo is a true monorepo with
several disjoint subsystems, a `REPO-MAP.md` may sit at the root of each
subsystem and the root file points to them. Default: one root file. Don't
nest speculatively.

Create the file lazily — only when the first area, convention, boundary, or
dead end is ready to write. Use the format in
[REPO-MAP-FORMAT.md](./REPO-MAP-FORMAT.md).

## When this skill updates the file

Two trigger points, both passive side-effects of work already happening:

1. **After a scout recon.** The scout just mapped an area. Before returning,
   it writes through: appends/updates the `## Areas` bullet(s) for what it
   mapped, and any `## Conventions` / `## Boundaries` it had to discover
   (the implicit patterns not in the README). This is the primary update
   path — it keeps the file fresh with zero manual upkeep.
2. **When a dead end is hit.** If a worker or scout tried an approach and
   it failed for a structural reason ("can't put this in `utils/`, that
   module has a no-side-effects rule"), append a `## Known dead ends`
   bullet so the next agent doesn't walk back into it.

The skill never bulk-rewrites the file. It edits the one section touched by
the work in front of it.

## How the file is consumed

The Manager reads `REPO-MAP.md` **once per task**, at dispatch-prep time,
and injects the 1–2 relevant `## Areas` bullets plus any matching
convention or dead-end into each scout/worker brief. Subagents do not read
the whole file — they get the slice that matters. This keeps the file from
becoming a context-taxing dump and lets it grow without penalty.

## Content rules

- **Point, don't re-list.** Each area bullet gives a path, a one-line
  purpose, an entry file, and key dependencies. It does not enumerate every
  file — that's what a scout is for, and the file would rot the moment it
  did.
- **Record only what's non-obvious.** The README already says what the
  project *is*. `REPO-MAP.md` earns its keep with the conventions and
  boundaries the code enforces but docs don't mention, and the dead ends
  that only someone who tried would know.
- **No secrets, no big code snippets, no chat dumps.** Same rules as any
  memory file. Refer to files; do not paste them.
- **Structure only.** Do not let this become a spec, a progress log, or a
  task scratchpad. Active task state belongs in the conversation; domain
  terms belong in `CONTEXT.md`; agent behavior belongs in `AGENTS.md`.
