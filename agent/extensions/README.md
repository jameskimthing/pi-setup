# Custom Extensions

This directory contains pi extensions installed locally (not via npm packages).

## subagents/

**Source**: https://github.com/amosblomqvist/pi-subagents  
**Reference**: [Simple Pi Subagents](https://youtu.be/KRVYUkM16hE) by Eero Alvar

Multi-agent orchestration extension. Registers a `subagent` tool that spawns isolated child pi processes for parallel task execution.

**Built-in agents**:
- `scout` - Fast codebase recon (read/grep/find/ls), uses deepseek-v4-flash
- `researcher` - Web research (firecrawl tools), uses deepseek-v4-flash  
- `worker` - Implementation (read/write/edit/bash + subagents), uses kimi-k2.7-code
- `reviewer` - Code review (read/grep/find + subagents), uses kimi-k2.7-code

Workers can spawn scout/researcher (depth 2 max). Up to 4 concurrent subagents by default.

**Structure**:
- `index.ts` - Main extension (934 lines), registers subagent tool, TUI components
- `agents/*.md` - Agent definitions with YAML frontmatter (name, tools, model, etc.)
- `tools/safe-bash.ts` - Safety-wrapped bash tool (blocks dangerous commands)

## firecrawl/

**Source**: Local custom extension  
**API**: https://docs.firecrawl.dev

Wraps Firecrawl v2 API for web scraping and search. Provides 5 tools: `firecrawl_scrape`, `firecrawl_crawl`, `firecrawl_map`, `firecrawl_search`, `firecrawl_extract`.

Requires `FIRECRAWL_API_KEY` in environment (typically in `~/.env_keys`).

**Structure**:
- `index.ts` - Single file extension (397 lines), API helpers + tool registration

## opencode-go-usage.ts

**Source**: Local custom utility

Adds `/usage` command to check OpenCode Go subscription quota. Shows usage percentages for rolling 5hr, weekly, and monthly windows.

**Strategy** (in order):
1. Try official `/zen/go/v1/usage` API (future-proof, currently 404)
2. Scrape dashboard if credentials configured (`OPENCODE_GO_WORKSPACE_ID` + `OPENCODE_GO_AUTH_COOKIE`)
3. Fall back to probing cheap models to check availability

**Structure**:
- Single file (428 lines), standalone extension
