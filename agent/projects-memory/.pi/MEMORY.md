Firecrawl tools `firecrawl_map`, `firecrawl_search`, `firecrawl_extract` DISABLED 2026-06-22 (not deleted). Disabled by commenting out `registerTool` blocks in `agent/extensions/firecrawl/index.ts` with `DISABLED 2026-06-22` marker. Re-enable = uncomment those blocks. Subagent agent files (researcher.md, worker-deep.md) had references to these tools removed from their `tools:` frontmatter and bodies. Only `firecrawl_scrape` and `firecrawl_crawl` remain active. <!-- created=2026-06-22, last=2026-06-22 -->
§
Pi extension architecture (repo at /root/.pi or similar):
- Custom extensions live in `agent/extensions/<name>/index.ts`, auto-discovered by manager.
- API keys stored in `~/.env_keys` (e.g. `FIRECRAWL_API_KEY`, `EXA_API_KEY`), sourced by pi into env.
- Subagents extension (`agent/extensions/subagents/index.ts`): custom tool extensions registered in `CUSTOM_TOOL_EXTENSIONS` array; `extractToolArgsPreview` switch handles preview strings per tool.
- Subagent agent prompts: `agent/extensions/subagents/agents/*.md` (frontmatter: name, description, tools, model, thinking). Keep `tools:` line accurate to what's actually registered.

Tool division of labor: Exa (`exa_search`) for web search/discovery, Firecrawl (`firecrawl_scrape`/`firecrawl_crawl`) for fetching page content.

Disabled tools (2026-06-22): firecrawl_map, firecrawl_search, firecrawl_extract — commented out (NOT deleted) in `agent/extensions/firecrawl/index.ts` with `DISABLED 2026-06-22` markers. Re-enable = uncomment the `pi.registerTool({...})` blocks. Module-level const schemas left in place (noUnusedLocals doesn't flag top-level). <!-- created=2026-06-22, last=2026-06-22 -->
§
Tool architecture: Exa for web search (discovery), Firecrawl for scrape/crawl of known URLs. Firecrawl's map/search/extract tools DISABLED 2026-06-22 (commented out registerTool blocks in agent/extensions/firecrawl/index.ts with `DISABLED <date>` markers — uncomment to re-enable). Exa extension lives at agent/extensions/exa/index.ts, registers `exa_search`. Both keys sourced from ~/.env_keys: EXA_API_KEY, FIRECRAWL_API_KEY. <!-- created=2026-06-22, last=2026-06-22 -->