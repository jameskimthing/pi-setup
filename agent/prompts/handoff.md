---
description: Compact the current conversation into a handoff document so another agent can continue the work. Use when a thread is full or you want to fork into a fresh session while preserving this conversation.
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the current working directory.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
