# Agent Architecture

Subagents for [pi-subagents-lite](https://github.com/AlexParamonov/pi-subagents-lite). Agent files live at `~/.pi/agent/agents/`.

## Pipeline

```
User → Manager (dispatches Scout + optional Researcher in parallel)
         ↓ collects reports, produces PLAN + QUALITY CONSTRAINTS + REVIEW CHECKLIST
       Executor or executor-deep (specified by Manager)
         ↓ output
       Reviewer (runs tests/lint, reads code — bash scoped to read-only)
         ↓ verdict: PASS | NEEDS_REVISION | FAIL
       Manager / User decides if revision needed
```

## Communication Model

Hub-and-spoke: the Manager is the only node that dispatches subagents. Agents don't talk to each other mid-run. Results flow back to the Manager (or user), which synthesizes context for the next dispatch.

- **Steer** (pi-subagents-lite) — inject guidance into a running agent without restarting. Available if course-correction is needed mid-flight.
- No `intercom`/bidirectional communication (that's a different extension: nicobailon/pi-subagents).
