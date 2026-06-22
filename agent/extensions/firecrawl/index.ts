/**
 * Firecrawl Extension for Pi
 *
 * Provides scrape, crawl, map, search, and extract tools via the Firecrawl v2 API.
 * Reads FIRECRAWL_API_KEY from environment (also sourced from ~/.env_keys by pi).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ── API helpers ──────────────────────────────────────────────────────────

const API_BASE = "https://api.firecrawl.dev/v2";

function getApiKey(): string {
	const key = process.env.FIRECRAWL_API_KEY?.trim();
	if (key) return key;
	throw new Error(
		"FIRECRAWL_API_KEY not set. Add it to ~/.env_keys or your shell environment.",
	);
}

async function apiPost(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
	const key = getApiKey();
	const res = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify(body),
		signal,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(`Firecrawl ${path} failed (${res.status}): ${text}`);
	}
	return res.json();
}

async function apiGet(path: string, signal?: AbortSignal): Promise<unknown> {
	const key = getApiKey();
	const res = await fetch(`${API_BASE}${path}`, {
		headers: { Authorization: `Bearer ${key}` },
		signal,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(`Firecrawl GET ${path} failed (${res.status}): ${text}`);
	}
	return res.json();
}

/** Poll an async job (crawl/extract) until completion or error. */
async function pollJob(
	endpoint: string,
	id: string,
	signal?: AbortSignal,
	intervalMs = 2000,
): Promise<unknown> {
	while (true) {
		if (signal?.aborted) throw new Error("Aborted");
		const data = (await apiGet(`${endpoint}/${id}`, signal)) as Record<string, unknown>;
		if (data.status === "completed") return data;
		if (data.status === "failed" || data.status === "error")
			throw new Error(`Job ${id} failed: ${data.error ?? JSON.stringify(data)}`);
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}

function truncate(text: string, maxChars = 50000): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + `\n\n... [truncated, ${text.length} total chars]`;
}

// ── Parameter schemas ───────────────────────────────────────────────────

const SCRAPE_PARAMS = Type.Object({
	url: Type.String({ description: "The URL to scrape" }),
	formats: Type.Optional(
		Type.Array(Type.String(), {
			description: 'Formats to return: "markdown", "html", "rawHtml", "links", "screenshot". Default: ["markdown"]',
		}),
	),
	onlyMainContent: Type.Optional(
		Type.Boolean({ description: "Strip nav, footer, etc. Default: true" }),
	),
	includeTags: Type.Optional(
		Type.Array(Type.String(), { description: "CSS selectors or tags to include" }),
	),
	excludeTags: Type.Optional(
		Type.Array(Type.String(), { description: "CSS selectors or tags to exclude" }),
	),
	waitFor: Type.Optional(
		Type.Number({ description: "Milliseconds to wait for dynamic content" }),
	),
});

const CRAWL_PARAMS = Type.Object({
	url: Type.String({ description: "Starting URL to crawl from" }),
	limit: Type.Optional(Type.Number({ description: "Max pages to crawl. Default: 10, max: 100" })),
	maxDepth: Type.Optional(Type.Number({ description: "Max crawl depth from starting URL" })),
	includes: Type.Optional(
		Type.Array(Type.String(), { description: "Glob patterns to include (e.g. /blog/*)" }),
	),
	excludes: Type.Optional(
		Type.Array(Type.String(), { description: "Glob patterns to exclude" }),
	),
	formats: Type.Optional(
		Type.Array(Type.String(), { description: 'Per-page formats. Default: ["markdown"]' }),
	),
	onlyMainContent: Type.Optional(Type.Boolean({ description: "Only main content per page. Default: true" })),
});

const MAP_PARAMS = Type.Object({
	url: Type.String({ description: "Base URL to map" }),
	includeSubdomains: Type.Optional(Type.Boolean({ description: "Include subdomains. Default: false" })),
	search: Type.Optional(Type.String({ description: "Filter URLs by search term" })),
	limit: Type.Optional(Type.Number({ description: "Max URLs to return. Default: 100" })),
});

const SEARCH_PARAMS = Type.Object({
	query: Type.String({ description: "Search query" }),
	limit: Type.Optional(Type.Number({ description: "Number of results. Default: 5, max: 10" })),
	scrapeOptions: Type.Optional(
		Type.Object({
			formats: Type.Optional(Type.Array(Type.String())),
			onlyMainContent: Type.Optional(Type.Boolean()),
		}),
		{ description: "Scrape each result for content" },
	),
});

const EXTRACT_PARAMS = Type.Object({
	urls: Type.Array(Type.String(), { description: "URLs to extract structured data from" }),
	prompt: Type.String({ description: "What to extract from the pages" }),
	schema: Type.Optional(
		Type.Record(Type.String(), Type.Any(), { description: "JSON Schema for structured output" }),
	),
});

// ── Extension entry ──────────────────────────────────────────────────────

export default function firecrawlExtension(pi: ExtensionAPI) {
	// ── firecrawl_scrape ──────────────────────────────────────────────────

	pi.registerTool({
		name: "firecrawl_scrape",
		label: "Firecrawl Scrape",
		description:
			"Scrape a single URL and return clean content as markdown, HTML, links, or screenshot. Use when you have a specific URL and want its page content.",
		promptSnippet: "Scrape a specific URL for its page content",
		promptGuidelines: [
			"Use firecrawl_scrape when you have a URL and need its content.",
			"Prefer firecrawl_crawl when you need multiple pages from a domain.",
			"Prefer firecrawl_search when you need to discover pages by query.",
		],
		parameters: SCRAPE_PARAMS,
		async execute(_id, params, signal, onUpdate, _ctx) {
			const formats = (params.formats as string[]) ?? ["markdown"];
			const body: Record<string, unknown> = {
				url: params.url,
				formats,
				onlyMainContent: params.onlyMainContent ?? true,
			};
			if (params.includeTags) body.includeTags = params.includeTags;
			if (params.excludeTags) body.excludeTags = params.excludeTags;
			if (params.waitFor) body.waitFor = params.waitFor;

			onUpdate({ content: [{ type: "text" as const, text: `Scraping ${params.url}…` }], details: {} });
			const resp = (await apiPost("/scrape", body, signal)) as Record<string, unknown>;

			if (resp.success === false) {
				throw new Error(`Scrape failed: ${resp.error ?? JSON.stringify(resp)}`);
			}

			const data = (resp.data ?? resp) as Record<string, unknown>;
			const parts: string[] = [];

			const md = data.markdown as string | undefined;
			const html = data.html as string | undefined;
			const rawHtml = data.rawHtml as string | undefined;
			const links = data.links as string[] | undefined;
			const screenshot = data.screenshot as string | undefined;
			const metadata = data.metadata as Record<string, unknown> | undefined;

			if (metadata?.url || metadata?.title) {
				const title = metadata?.title ? ` — ${metadata.title}` : "";
				parts.push(`# ${metadata?.url ?? params.url}${title}`);
			}

			if (md) parts.push(md);
			if (html) parts.push(`--- HTML ---\n${html}`);
			if (rawHtml) parts.push(`--- Raw HTML ---\n${rawHtml}`);
			if (links?.length) parts.push(`--- Links ---\n${links.join("\n")}`);
			if (screenshot) parts.push(`--- Screenshot URL ---\n${screenshot}`);

			return {
				content: [{ type: "text" as const, text: truncate(parts.join("\n\n")) }],
				details: data,
			};
		},
	});

	// ── firecrawl_crawl ───────────────────────────────────────────────────

	pi.registerTool({
		name: "firecrawl_crawl",
		label: "Firecrawl Crawl",
		description:
			"Crawl a website starting from a URL, collecting multiple pages. Returns all crawled page content. Use for scraping a whole docs site, blog, or section of a domain.",
		promptSnippet: "Crawl an entire site or section for multiple pages",
		promptGuidelines: [
			"Use firecrawl_crawl when you need content from multiple pages under a domain.",
			"Set a limit to avoid excessive crawling — start with 10–20.",
			"Use includes/excludes glob patterns to scope the crawl.",
		],
		parameters: CRAWL_PARAMS,
		async execute(_id, params, signal, onUpdate, _ctx) {
			const limit = (params.limit as number) ?? 10;
			const formats = (params.formats as string[]) ?? ["markdown"];
			const body: Record<string, unknown> = {
				url: params.url,
				limit: Math.min(limit, 100),
				scrapeOptions: { formats, onlyMainContent: params.onlyMainContent ?? true },
			};
			if (params.maxDepth) body.maxDiscoveryDepth = params.maxDepth;
			if (params.includes) body.includePaths = params.includes;
			if (params.excludes) body.excludePaths = params.excludes;

			onUpdate({ content: [{ type: "text" as const, text: `Starting crawl from ${params.url} (limit: ${limit})…` }], details: {} });
			const job = (await apiPost("/crawl", body, signal)) as { id: string };
			onUpdate({ content: [{ type: "text" as const, text: `Crawl job ${job.id} submitted, polling…` }], details: {} });

			const result = (await pollJob("/crawl", job.id, signal, 2000)) as Record<string, unknown>;
			const pages = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
			onUpdate({ content: [{ type: "text" as const, text: `Crawled ${pages.length} pages` }], details: {} });

			const parts = pages.map((page, i) => {
				const meta = page.metadata as Record<string, unknown> | undefined;
				const url = meta?.url ?? `page ${i + 1}`;
				const title = meta?.title ? ` — ${meta.title}` : "";
				const content = (page.markdown as string) ?? (page.html as string) ?? "(no content)";
				return `### ${url}${title}\n${content}`;
			});

			const text = `Crawled ${pages.length} page(s) from ${params.url}:\n\n` + parts.join("\n\n---\n\n");
			const total = (result.total as number) ?? pages.length;
			return {
				content: [{ type: "text" as const, text: truncate(text) }],
				details: { total, pages: pages.length },
			};
		},
	});

	// ── firecrawl_map ─────────────────────────────────────────────────────
	// DISABLED 2026-06-22: tool removed from rotation. Re-enable by restoring
	// the `pi.registerTool({ ... })` block below (see git history for the body).
	// The MAP_PARAMS schema and the /map API helper are kept above so the only
	// change needed to re-enable is uncommenting this block.
	/*
	pi.registerTool({
		name: "firecrawl_map",
		label: "Firecrawl Map",
		description:
			"Discover all URLs on a website. Use when you need to know what pages exist on a domain before crawling or scraping.",
		promptSnippet: "List all URLs on a website",
		promptGuidelines: [
			"Use firecrawl_map to discover available pages on a site.",
			"Then use firecrawl_scrape on specific URLs, or firecrawl_crawl with includes/excludes.",
		],
		parameters: MAP_PARAMS,
		async execute(_id, params, signal, onUpdate, _ctx) {
			onUpdate({ content: [{ type: "text" as const, text: `Mapping ${params.url}…` }], details: {} });
			const body: Record<string, unknown> = { url: params.url };
			if (params.includeSubdomains) body.includeSubdomains = params.includeSubdomains;
			if (params.search) body.search = params.search;
			if (params.limit) body.limit = params.limit;

			const resp = (await apiPost("/map", body, signal)) as Record<string, unknown>;
			if (resp.success === false) {
				throw new Error(`Map failed: ${resp.error ?? JSON.stringify(resp)}`);
			}
			const mapData = (resp.data ?? resp) as Record<string, unknown>;
			const linkObjects = (mapData.links ?? resp.links ?? []) as Array<{ url: string; title?: string } | string>;
			const urls = linkObjects.map((l) => (typeof l === "string" ? l : l.url));
			const displayLines = linkObjects.map((l) => {
				if (typeof l === "string") return l;
				return l.title ? `${l.url} — ${l.title}` : l.url;
			});
			return {
				content: [
					{
						type: "text" as const,
						text: `Found ${urls.length} URL(s) on ${params.url}:\n\n${displayLines.join("\n")}`,
					},
				],
				details: { urls },
			};
		},
	});
	*/

	// ── firecrawl_search ──────────────────────────────────────────────────
	// DISABLED 2026-06-22: tool removed from rotation. Re-enable by restoring
	// the `pi.registerTool({ ... })` block below (see git history for the body).
	/*
	pi.registerTool({
		name: "firecrawl_search",
		label: "Firecrawl Search",
		description:
			"Search the web and optionally scrape each result. Use when you need to discover pages by query and optionally get their content.",
		promptSnippet: "Search the web and get page content",
		promptGuidelines: [
			"Use firecrawl_search to find pages by keyword and retrieve their content.",
			"Set scrapeOptions.formats to include content formats like markdown.",
		],
		parameters: SEARCH_PARAMS,
		async execute(_id, params, signal, onUpdate, _ctx) {
			onUpdate({ content: [{ type: "text" as const, text: `Searching: "${params.query}"…` }], details: {} });
			const body: Record<string, unknown> = { query: params.query };
			if (params.limit) body.limit = params.limit;
			if (params.scrapeOptions) body.scrapeOptions = params.scrapeOptions;

			const resp = (await apiPost("/search", body, signal)) as Record<string, unknown>;
			if (resp.success === false) {
				throw new Error(`Search failed: ${resp.error ?? JSON.stringify(resp)}`);
			}
			const searchData = (resp.data ?? resp) as Record<string, unknown>;
			const results = (Array.isArray(searchData) ? searchData : (Array.isArray(searchData.web) ? searchData.web : [])) as Array<Record<string, unknown>>;

			if (results.length === 0) {
				return {
					content: [{ type: "text" as const, text: `No results for "${params.query}"` }],
					details: resp,
				};
			}

			const parts = results.map((r) => {
				const title = (r.title as string) ?? "Untitled";
				const url = (r.url as string) ?? "";
				const desc = (r.description as string) ?? "";
				const md = (r.markdown as string) ?? "";
				const lines = [`**${title}** — ${url}`];
				if (desc) lines.push(desc);
				if (md) lines.push(md);
				return lines.join("\n");
			});

			return {
				content: [
					{
						type: "text" as const,
						text: truncate(`Found ${results.length} result(s)\n\n${parts.join("\n\n---\n\n")}`),
					},
				],
				details: resp,
			};
		},
	});
	*/

	// ── firecrawl_extract ──────────────────────────────────────────────────
	// DISABLED 2026-06-22: tool removed from rotation. Re-enable by restoring
	// the `pi.registerTool({ ... })` block below (see git history for the body).
	/*
	pi.registerTool({
		name: "firecrawl_extract",
		label: "Firecrawl Extract",
		description:
			"Extract structured data from one or more URLs using LLM-powered extraction. Provide URLs, a prompt, and optionally a JSON schema for the output shape.",
		promptSnippet: "Extract structured data from URLs",
		promptGuidelines: [
			"Use firecrawl_extract when you need specific fields from pages, not full content.",
			"Provide a clear prompt describing what to extract.",
			"Optionally provide a JSON schema for structured output.",
		],
		parameters: EXTRACT_PARAMS,
		async execute(_id, params, signal, onUpdate, _ctx) {
			onUpdate({ content: [{ type: "text" as const, text: `Extracting from ${params.urls.length} URL(s)…` }], details: {} });
			const body: Record<string, unknown> = {
				urls: params.urls,
				prompt: params.prompt,
			};
			if (params.schema) body.schema = params.schema;

			const job = (await apiPost("/extract", body, signal)) as { id: string };
			onUpdate({ content: [{ type: "text" as const, text: `Extract job ${job.id} submitted, polling…` }], details: {} });

			const result = (await pollJob("/extract", job.id, signal, 3000)) as Record<string, unknown>;
			const extracted = result.data ?? result;
			return {
				content: [
					{
						type: "text" as const,
						text: truncate(
							typeof extracted === "object"
								? JSON.stringify(extracted, null, 2)
								: String(extracted),
						),
					},
				],
				details: result,
			};
		},
	});
	*/
}