# Custom Extensions

This directory contains pi extensions installed locally (not via npm packages).

## subagents/

**Source**: https://github.com/amosblomqvist/pi-subagents  
**Reference**: [Simple Pi Subagents](https://youtu.be/KRVYUkM16hE) by Eero Alvar

Multi-agent orchestration extension. Registers a `subagent` tool that spawns isolated child pi processes for parallel task execution.

**Built-in agents**:
- `scout` - Fast codebase recon (read/grep/find/ls), uses deepseek-v4-flash
- `researcher` - Web research (exa_search + firecrawl scrape/crawl), uses deepseek-v4-flash  
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

Wraps Firecrawl v2 API for web scraping. Provides 2 active tools: `firecrawl_scrape`, `firecrawl_crawl`. (`firecrawl_map`, `firecrawl_search`, `firecrawl_extract` are disabled in the source — uncomment their `pi.registerTool` blocks to re-enable.)

Requires `FIRECRAWL_API_KEY` in environment (typically in `~/.env_keys`).

**Structure**:
- `index.ts` - Single file extension (~400 lines), API helpers + tool registration

## exa/

**Source**: Local custom extension  
**API**: https://docs.exa.ai/reference/search

Wraps the Exa search API. Registers one tool: `exa_search` — web search that returns URLs plus optional page content. Use Exa for *discovery*, Firecrawl for *fetching a known URL*.

Requires `EXA_API_KEY` in environment (typically in `~/.env_keys`).

**Structure**:
- `index.ts` - Single file extension, API helper + tool registration

## limits-usage.ts

**Source**: Local custom utility

Adds `/usage` command showing usage + limits for three APIs in one view:

- **OpenCode Go** — rolling 5hr / weekly / monthly usage %, plus a model-availability probe. Strategy: try `/zen/go/v1/usage` API → scrape dashboard if `OPENCODE_GO_WORKSPACE_ID` + `OPENCODE_GO_AUTH_COOKIE` configured → fall back to probing cheap models.
- **Firecrawl** — remaining credits vs plan credits, billing period. Uses `FIRECRAWL_API_KEY` (same key as the firecrawl extension). Calls `GET /v2/team/credit-usage`.
- **Exa** — free-tier usage bar (requests used vs the 20,000 free requests/month plan) plus cost in USD over the period, per-key breakdown by price type (Neural Search, Content Retrieval, etc.), and budget status. Requires `EXA_SERVICE_KEY` (a *service* key, separate from the search `EXA_API_KEY`); create one at https://dashboard.exa.ai/api-keys and add to `~/.env_keys`. Exa has no remaining-balance API, so usage is reported as spend over a period.

Each section degrades gracefully: missing keys or fetch failures show a hint instead of aborting the whole command.

**Structure**:
- Single file standalone extension
