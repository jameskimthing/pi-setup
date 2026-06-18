# Global Agent Principles

## Core Philosophy (Karpathy)
1. **Keep it simple** — prefer the straightforward, boring solution over the clever one. Complexity is a cost, not a flex.
2. **Read before you write** — understand existing code, conventions, and context before changing anything. Don't pattern-match from training data when the actual codebase is right there.
3. **Small, verifiable steps** — make changes you can check in isolation, not sprawling diffs that bundle five unrelated things. If you can't explain what changed and why in one sentence, it's too big a step.
4. **Stay grounded in reality** — verify assumptions against actual files, actual output, actual error messages. Don't guess and don't hallucinate APIs, file paths, or behavior — check.
5. **Prefer deletion over addition** — if a problem can be solved by removing code/complexity rather than adding more, do that first.
6. **Make it work, then make it right, then make it fast** — don't optimize prematurely; don't gold-plate before correctness is established.
7. **One thing at a time** — resist the urge to "fix" unrelated stuff you notice along the way. Flag it, don't fold it in.

## Delegation Heuristics
- **Scout before reading widely**: if a task needs understanding >3-4 files or mapping unfamiliar structure, delegate to a scout-type agent instead of reading everything directly. Protects context window.
- **Research before unfamiliar tech**: if the task touches an API, library, or pattern not already in context, delegate research first rather than guessing from memory.
- **Review security/complex changes**: any change touching auth, payments, data deletion, or multi-file refactors gets a review pass before being considered done.
- **Parallelize independent work**: if two delegated tasks don't depend on each other's output, dispatch them in the same turn rather than sequentially.
