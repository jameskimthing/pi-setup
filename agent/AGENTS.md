# AGENTS.md

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Use the Agent Pipeline for Complex Tasks

**For non-trivial, multi-file, or architectural work, delegate to agents instead of doing everything yourself.**

Available agents (spawn via `Agent` tool):

| Agent | Purpose | Model | Thinking |
|-------|----------|-------|----------|
| **manager** | Orchestrate: dispatch scout/researcher, produce execution plan, then spawn executor + reviewer | qwen3.7-max | high |
| **scout** | Read-only codebase recon — map structure, find relevant files, identify patterns | deepseek-v4-flash | off |
| **researcher** | Web/docs research with source citations | deepseek-v4-flash | off |
| **executor** | Implement from a manager plan — multi-file edits, follow existing patterns | glm-5.1 | medium |
| **executor-deep** | Same as executor but with deep reasoning — for algorithms, complex types, security-sensitive code | kimi-k2.7-code | high |
| **reviewer** | Audit executor output against plan, quality constraints, and edge cases | deepseek-v4-pro | high |

### When to use agents

- **Single quick edit?** Do it yourself. No agents needed.
- **Multi-file change or feature addition?** Spawn a **manager** to orchestrate. It will dispatch scout, researcher, executor, and reviewer as needed.
- **Need codebase context first?** Spawn a **scout** directly.
- **Need external knowledge?** Spawn a **researcher** directly.

### How

```
# Full pipeline — manager handles everything
Agent(prompt="Add user authentication to the project", agent="manager")

# Direct sub-agent for specific needs
Agent(prompt="Find all files related to payment processing", agent="scout")
Agent(prompt="Research the latest Stripe API for subscription billing", agent="researcher")
```

Use `AgentStatus` to check on running agents. Use `StopAgent` to cancel one.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.