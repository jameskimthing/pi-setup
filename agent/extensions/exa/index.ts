/**
 * Exa Extension for Pi
 *
 * Provides web search via the Exa API. Exa returns URLs (and optionally page
 * content) for a natural-language query — use it to *discover* pages. For
 * fetching a known URL's full content, prefer firecrawl_scrape.
 *
 * Reads EXA_API_KEY from environment (also sourced from ~/.env_keys by pi).
 * API: https://docs.exa.ai/reference/search
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ── API helpers ──────────────────────────────────────────────────────────

const API_BASE = "https://api.exa.ai";

function getApiKey(): string {
	const key = process.env.EXA_API_KEY?.trim();
	if (key) return key;
	throw new Error(
		"EXA_API_KEY not set. Add it to ~/.env_keys or your shell environment.",
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
		throw new Error(`Exa ${path} failed (${res.status}): ${text}`);
	}
	return res.json();
}

function truncate(text: string, maxChars = 50000): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + `\n\n... [truncated, ${text.length} total chars]`;
}

// ── Parameter schema ────────────────────────────────────────────────────

const SEARCH_PARAMS = Type.Object({
	query: Type.String({ description: "Natural-language search query. Exa is neural-first — phrasing it as a question or descriptive phrase works well." }),
	numResults: Type.Optional(
		Type.Number({ description: "Number of results to return. Default: 5, max: 10." }),
	),
	type: Type.Optional(
		Type.String({
			description: '"auto" (default, lets Exa pick keyword vs neural), "keyword", or "neural".',
		}),
	),
	category: Type.Optional(
		Type.String({
			description: 'Optional Exa category hint, e.g. "research paper", "company", "github", "linkedin profile", "news".',
		}),
	),
	includeDomains: Type.Optional(
		Type.Array(Type.String(), { description: "Restrict results to these domains (e.g. [\"react.dev\", \"developer.mozilla.org\"])." }),
	),
	excludeDomains: Type.Optional(
		Type.Array(Type.String(), { description: "Exclude results from these domains." }),
	),
	startPublishedDate: Type.Optional(
		Type.String({ description: "Only return pages published on/after this date (YYYY-MM-DD)." }),
	),
	endPublishedDate: Type.Optional(
		Type.String({ description: "Only return pages published on/before this date (YYYY-MM-DD)." }),
	),
	contents: Type.Optional(
		Type.Object({
			text: Type.Optional(Type.Boolean({ description: "Include extracted page text. Default: true." })),
			maxCharacters: Type.Optional(
				Type.Number({ description: "Cap on extracted text chars per result. Default: 1000." }),
			),
		}),
		{ description: "Controls inline content. Defaults to { text: true, maxCharacters: 1000 }." },
	),
});

// ── Extension entry ──────────────────────────────────────────────────────

export default function exaExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "exa_search",
		label: "Exa Search",
		description:
			"Search the web via Exa and return URLs plus optional page content. Use for *discovering* pages by query. For a known URL's full content, prefer firecrawl_scrape.",
		promptSnippet: "Search the web by natural-language query",
		promptGuidelines: [
			"Use exa_search to discover pages — Exa returns URLs (and optionally a short content excerpt).",
			"For a known URL you already have, use firecrawl_scrape to get full content rather than re-searching.",
			"Vary query angles: direct phrasing, authoritative-source phrasing, practical-experience phrasing.",
		],
		parameters: SEARCH_PARAMS,
		async execute(_id, params, signal, onUpdate, _ctx) {
			const numResults = Math.min((params.numResults as number) ?? 5, 10);
			const contents = (params.contents as { text?: boolean; maxCharacters?: number } | undefined) ?? {};
			const includeText = contents.text ?? true;
			const maxCharacters = contents.maxCharacters ?? 1000;

			const body: Record<string, unknown> = {
				query: params.query,
				numResults,
			};
			if (params.type) body.type = params.type;
			if (params.category) body.category = params.category;
			if (params.includeDomains) body.includeDomains = params.includeDomains;
			if (params.excludeDomains) body.excludeDomains = params.excludeDomains;
			if (params.startPublishedDate) body.startPublishedDate = params.startPublishedDate;
			if (params.endPublishedDate) body.endPublishedDate = params.endPublishedDate;
			if (includeText) {
				body.contents = { text: true, maxCharacters };
			}

			onUpdate({ content: [{ type: "text" as const, text: `Searching Exa: "${params.query}"…` }], details: {} });

			const resp = (await apiPost("/search", body, signal)) as {
				results?: Array<{
					title?: string;
					url?: string;
					text?: string;
					publishedDate?: string;
					author?: string;
					score?: number;
				}>;
				requestId?: string;
			};

			const results = Array.isArray(resp.results) ? resp.results : [];

			if (results.length === 0) {
				return {
					content: [{ type: "text" as const, text: `No results for "${params.query}"` }],
					details: resp,
				};
			}

			const parts = results.map((r, i) => {
				const title = r.title ?? "Untitled";
				const url = r.url ?? "";
				const date = r.publishedDate ? ` (${r.publishedDate})` : "";
				const lines = [`${i + 1}. **${title}**${date} — ${url}`];
				if (r.author) lines.push(`   by ${r.author}`);
				if (r.text) lines.push(`   ${r.text}`);
				return lines.join("\n");
			});

			const header = `Found ${results.length} result(s) for "${params.query}":\n\n`;
			return {
				content: [
					{
						type: "text" as const,
						text: truncate(header + parts.join("\n\n---\n\n")),
					},
				],
				details: { urls: results.map((r) => r.url).filter(Boolean), requestId: resp.requestId },
			};
		},
	});
}
