/**
 * API Usage Extension for Pi
 *
 * Adds /usage command showing usage + limits for:
 * - OpenCode Go subscription (rolling/weekly/monthly %)
 * - Firecrawl (remaining credits / plan credits, billing period)
 * - Exa (cost in USD over last 30 days, per-key breakdown)
 *
 * OpenCode Go strategy (in order):
 * 1. Try /zen/go/v1/usage API (currently 404, future-proof)
 * 2. If dashboard credentials configured, scrape for exact percentages
 * 3. Fall back to probing cheap models to check availability
 *
 * OpenCode Go dashboard config (for exact %):
 *   Env: OPENCODE_GO_WORKSPACE_ID + OPENCODE_GO_AUTH_COOKIE
 *   File: ~/.config/opencode/opencode-quota/opencode-go.json
 *         { "workspaceId": "wrk_...", "authCookie": "Fe26.2**..." }
 *
 * Firecrawl: uses FIRECRAWL_API_KEY (same key as the firecrawl extension).
 *
 * Exa: the admin team-management API requires a *service* API key, which is
 * separate from the EXA_API_KEY used for search. Set EXA_SERVICE_KEY
 * (add to ~/.env_keys). Create one at https://dashboard.exa.ai/api-keys.
 * Exa has no remaining-balance API; usage shows cost in USD over a period.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface UsageWindow {
  usagePercent: number;
  resetInSec: number;
}

interface DashboardResult {
  rolling?: UsageWindow;
  weekly?: UsageWindow;
  monthly?: UsageWindow;
}

interface GoConfig {
  workspaceId: string;
  authCookie: string;
}

// ── Config ──

function resolveConfig(): GoConfig | null {
  const wsId = process.env.OPENCODE_GO_WORKSPACE_ID?.trim();
  const cookie = process.env.OPENCODE_GO_AUTH_COOKIE?.trim();
  if (wsId && cookie) {
    return { workspaceId: wsId, authCookie: cookie };
  }

  const candidates: string[] = [];
  if (process.env.OPENCODE_GO_QUOTA_CONFIG) {
    candidates.push(process.env.OPENCODE_GO_QUOTA_CONFIG);
  }
  candidates.push(path.join(os.homedir(), ".config", "opencode", "opencode-quota", "opencode-go.json"));

  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const wid = typeof data.workspaceId === "string" ? data.workspaceId.trim() : "";
      const ck = typeof data.authCookie === "string" ? data.authCookie.trim() : "";
      if (wid && ck) {
        return { workspaceId: wid, authCookie: ck };
      }
    } catch {
      // skip missing/unreadable files
    }
  }
  return null;
}

// ── API Key ──

function getApiKey(): string | null {
  // Check pi auth.json, then opencode's auth.json
  const authPaths = [
    path.join(os.homedir(), ".pi", "agent", "auth.json"),
    path.join(os.homedir(), ".local", "share", "opencode", "auth.json"),
  ];

  for (const authPath of authPaths) {
    try {
      const raw = fs.readFileSync(authPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, Record<string, string>>;
      const provider = data["opencode-go"] ?? data["opencode"];
      if (provider?.key) {
        const key = provider.key.trim();
        if (key.startsWith("$")) {
          return process.env[key.slice(1)] ?? null;
        }
        if (key.startsWith("!")) {
          return null; // can't safely execute shell commands
        }
        return key;
      }
    } catch {
      // skip missing/unreadable auth file
    }
  }
  return process.env.OPENCODE_API_KEY?.trim() ?? null;
}

// ── Formatting ──

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return Math.round(seconds) + "s";
  }
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    return mins + "m";
  }
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) {
    return hours + "h " + remainMins + "m";
  }
  const days = Math.floor(hours / 24);
  return days + "d " + (hours % 24) + "h";
}

function progressBar(percent: number, width: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

// ── Dashboard scraper ──

function parseWindowUsage(html: string, rePctFirst: RegExp, reResetFirst: RegExp): UsageWindow | null {
  const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

  const m1 = rePctFirst.exec(html);
  if (m1) {
    const usagePercent = Number(m1[1]);
    const resetInSec = Number(m1[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }

  const m2 = reResetFirst.exec(html);
  if (m2) {
    const resetInSec = Number(m2[1]);
    const usagePercent = Number(m2[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }

  return null;
}

async function scrapeDashboard(config: GoConfig): Promise<DashboardResult | null> {
  const url = "https://opencode.ai/workspace/" + encodeURIComponent(config.workspaceId) + "/go";
  try {
    const controller = new AbortController();
    const tid = setTimeout(function () { controller.abort(); }, 10000);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        Accept: "text/html",
        Cookie: "auth=" + config.authCookie,
      },
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (!response.ok) {
      return null;
    }
    const html = await response.text();

    const N = String.raw`(-?\d+(?:\.\d+)?)`;

    const rolling = parseWindowUsage(
      html,
      new RegExp(String.raw`rollingUsage:\$R\[\d+\]=\{[^}]*usagePercent:${N}[^}]*resetInSec:${N}[^}]*\}`),
      new RegExp(String.raw`rollingUsage:\$R\[\d+\]=\{[^}]*resetInSec:${N}[^}]*usagePercent:${N}[^}]*\}`),
    );
    const weekly = parseWindowUsage(
      html,
      new RegExp(String.raw`weeklyUsage:\$R\[\d+\]=\{[^}]*usagePercent:${N}[^}]*resetInSec:${N}[^}]*\}`),
      new RegExp(String.raw`weeklyUsage:\$R\[\d+\]=\{[^}]*resetInSec:${N}[^}]*usagePercent:${N}[^}]*\}`),
    );
    const monthly = parseWindowUsage(
      html,
      new RegExp(String.raw`monthlyUsage:\$R\[\d+\]=\{[^}]*usagePercent:${N}[^}]*resetInSec:${N}[^}]*\}`),
      new RegExp(String.raw`monthlyUsage:\$R\[\d+\]=\{[^}]*resetInSec:${N}[^}]*usagePercent:${N}[^}]*\}`),
    );

    if (!rolling && !weekly && !monthly) {
      return null;
    }

    return {
      rolling: rolling ?? undefined,
      weekly: weekly ?? undefined,
      monthly: monthly ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Usage API (future-proof) ──

async function tryUsageApi(apiKey: string): Promise<DashboardResult | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(function () { controller.abort(); }, 10000);
    const response = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { Authorization: "Bearer " + apiKey },
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;

    function toWindow(obj: unknown): UsageWindow | undefined {
      if (!obj || typeof obj !== "object") {
        return undefined;
      }
      const o = obj as Record<string, unknown>;
      return {
        usagePercent: typeof o.usagePercent === "number" ? o.usagePercent : Number(o.usagePercent ?? 0),
        resetInSec: typeof o.resetInSec === "number" ? o.resetInSec : Number(o.resetInSec ?? 0),
      };
    }

    const rolling = toWindow(data.rolling5h ?? data.rolling);
    const weekly = toWindow(data.weekly);
    const monthly = toWindow(data.monthly);

    if (!rolling && !weekly && !monthly) {
      return null;
    }

    return {
      rolling: rolling ?? undefined,
      weekly: weekly ?? undefined,
      monthly: monthly ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Model probe (fallback) ──

const PROBE_MODELS = [
  { id: "deepseek-v4-flash", api: "openai" },
  { id: "mimo-v2.5", api: "openai" },
  { id: "minimax-m3", api: "anthropic" },
  { id: "glm-5.1", api: "openai" },
  { id: "qwen3.7-max", api: "anthropic" },
  { id: "deepseek-v4-pro", api: "openai" },
  { id: "kimi-k2.7-code", api: "openai" },
];

const ZEN_URL = "https://opencode.ai/zen/go/v1";

async function probeModel(apiKey: string, model: { id: string; api: string }): Promise<string> {
  const endpoint = model.api === "anthropic"
    ? ZEN_URL + "/messages"
    : ZEN_URL + "/chat/completions";

  let body: Record<string, unknown>;
  if (model.api === "anthropic") {
    body = {
      model: model.id,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
      anthropic_version: "2023-06-01",
    };
  } else {
    body = {
      model: model.id,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    };
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(function () { controller.abort(); }, 15000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (response.ok) {
      return "available";
    }
    if (response.status === 429) {
      return "rate_limited";
    }
    if (response.status === 401 || response.status === 403) {
      return "auth_error";
    }
    return "error";
  } catch {
    return "error";
  }
}

interface ProbeResult {
  ok: boolean;
  model?: string;
  error?: string;
}

async function probeGoAvailability(apiKey: string): Promise<ProbeResult> {
  for (const model of PROBE_MODELS) {
    const result = await probeModel(apiKey, model);
    if (result === "available") {
      return { ok: true, model: model.id };
    }
    if (result === "rate_limited") {
      return { ok: false, error: "Rate limited (failed on " + model.id + ")" };
    }
    // auth_error or per-model error — keep trying
  }
  return { ok: false, error: "All model probes failed" };
}

// ── Build output ──

function buildDashboardOutput(result: DashboardResult): string {
  const lines: string[] = [];
  const windows: Array<{ label: string; data: UsageWindow | undefined; limit: string }> = [
    { label: "Rolling (5hr)", data: result.rolling, limit: "$12" },
    { label: "Weekly", data: result.weekly, limit: "$30" },
    { label: "Monthly", data: result.monthly, limit: "$60" },
  ];

  for (const entry of windows) {
    if (!entry.data) {
      continue;
    }
    const pct = Math.min(100, Math.max(0, entry.data.usagePercent));
    const remaining = 100 - pct;
    const bar = progressBar(pct, 20);
    const reset = formatDuration(entry.data.resetInSec);
    lines.push(
      "  " + entry.label.padEnd(14) + " " + bar +
        " " + pct.toFixed(1).padStart(5) + "% used" +
        " (" + remaining.toFixed(1) + "% left)" +
        "  limit " + entry.limit +
        "  resets " + reset,
    );
  }
  return lines.join("\n");
}

// ── Firecrawl usage ──

interface FirecrawlUsage {
  remainingCredits: number;
  planCredits: number;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

async function fetchFirecrawlUsage(): Promise<FirecrawlUsage | null> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) return null;
  try {
    const controller = new AbortController();
    const tid = setTimeout(function () { controller.abort(); }, 10000);
    const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
      headers: { Authorization: "Bearer " + key },
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const d = body.data;
    if (!d) return null;
    const start = d.billingPeriodStart ?? d.billing_period_start ?? null;
    const end = d.billingPeriodEnd ?? d.billing_period_end ?? null;
    return {
      remainingCredits: Number(d.remainingCredits ?? d.remaining_credits ?? 0),
      planCredits: Number(d.planCredits ?? d.plan_credits ?? 0),
      billingPeriodStart: typeof start === "string" ? start : null,
      billingPeriodEnd: typeof end === "string" ? end : null,
    };
  } catch {
    return null;
  }
}

function formatIsoDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function buildFirecrawlSection(u: FirecrawlUsage): string[] {
  const out: string[] = ["🔥 Firecrawl", "─".repeat(55)];
  const used = Math.max(0, u.planCredits - u.remainingCredits);
  const pct = u.planCredits > 0 ? (used / u.planCredits) * 100 : 0;
  const remainingPct = u.planCredits > 0 ? (u.remainingCredits / u.planCredits) * 100 : 0;
  const bar = progressBar(pct, 20);
  out.push(
    "  " + bar +
      " " + pct.toFixed(1).padStart(5) + "% used" +
      "  " + u.remainingCredits + " / " + u.planCredits + " credits left" +
      " (" + remainingPct.toFixed(1) + "%)",
  );
  out.push(
    "  Billing period: " + formatIsoDate(u.billingPeriodStart) +
      " → " + formatIsoDate(u.billingPeriodEnd),
  );
  return out;
}

// ── Exa usage ──

interface ExaKeyUsage {
  id: string;
  name: string | null;
  totalCostUsd: number;
  breakdown: Array<{ priceName: string; quantity: number; amountUsd: number }>;
  budgetCents: number | null;
  isOverBudget: boolean;
  periodStart: string;
  periodEnd: string;
  fetchFailed: boolean;
}

// Exa free tier: 20,000 requests/month free (Search endpoint).
// Source: https://exa.ai/pricing
const EXA_FREE_TIER_REQUESTS = 20000;

async function fetchExaUsage(): Promise<{ keys: ExaKeyUsage[]; unauthorized: boolean } | null> {
  const serviceKey = process.env.EXA_SERVICE_KEY?.trim();
  if (!serviceKey) return null;
  const adminBase = "https://admin-api.exa.ai/team-management";
  try {
    const controller = new AbortController();
    const tid = setTimeout(function () { controller.abort(); }, 10000);
    const listRes = await fetch(adminBase + "/api-keys", {
      headers: { "x-api-key": serviceKey },
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (listRes.status === 401 || listRes.status === 403) {
      return { keys: [], unauthorized: true };
    }
    if (!listRes.ok) return null;
    const listBody = (await listRes.json()) as {
      apiKeys?: Array<{
        id: string;
        name?: string | null;
        budgetCents?: number | null;
        isOverBudget?: boolean;
      }>;
    };
    const keys = Array.isArray(listBody.apiKeys) ? listBody.apiKeys : [];
    if (keys.length === 0) return { keys: [], unauthorized: false };

    const results: ExaKeyUsage[] = [];
    for (const k of keys) {
      const base: ExaKeyUsage = {
        id: k.id,
        name: k.name ?? null,
        totalCostUsd: 0,
        breakdown: [],
        budgetCents: k.budgetCents ?? null,
        isOverBudget: k.isOverBudget ?? false,
        periodStart: "",
        periodEnd: "",
        fetchFailed: false,
      };
      try {
        const c2 = new AbortController();
        const t2 = setTimeout(function () { c2.abort(); }, 10000);
        const uRes = await fetch(
          adminBase + "/api-keys/" + encodeURIComponent(k.id) + "/usage",
          { headers: { "x-api-key": serviceKey }, signal: c2.signal },
        );
        clearTimeout(t2);
        if (!uRes.ok) {
          base.fetchFailed = true;
          results.push(base);
          continue;
        }
        const u = (await uRes.json()) as {
          total_cost_usd?: number;
          cost_breakdown?: Array<{ price_name?: string; quantity?: number; amount_usd?: number }>;
          period?: { start?: string; end?: string };
        };
        base.totalCostUsd = Number(u.total_cost_usd ?? 0);
        base.breakdown = (Array.isArray(u.cost_breakdown) ? u.cost_breakdown : []).map(function (b) {
          return {
            priceName: b.price_name ?? "unknown",
            quantity: Number(b.quantity ?? 0),
            amountUsd: Number(b.amount_usd ?? 0),
          };
        });
        base.periodStart = u.period?.start ?? "";
        base.periodEnd = u.period?.end ?? "";
        results.push(base);
      } catch {
        base.fetchFailed = true;
        results.push(base);
      }
    }
    return { keys: results, unauthorized: false };
  } catch {
    return null;
  }
}

function buildExaSection(res: { keys: ExaKeyUsage[]; unauthorized: boolean }): string[] {
  const out: string[] = ["🔎 Exa", "─".repeat(55)];
  if (res.unauthorized) {
    out.push("  ⚠ EXA_SERVICE_KEY rejected (401)");
    out.push("    Verify the service key at https://dashboard.exa.ai/api-keys");
    return out;
  }
  if (res.keys.length === 0) {
    out.push("  No API keys found on this team");
    return out;
  }
  const totalAll = res.keys.reduce(function (s, k) { return s + k.totalCostUsd; }, 0);
  const totalRequests = res.keys.reduce(function (s, k) {
    return s + k.breakdown.reduce(function (qs, b) { return qs + b.quantity; }, 0);
  }, 0);
  const usedPct = Math.min(100, (totalRequests / EXA_FREE_TIER_REQUESTS) * 100);
  const remaining = Math.max(0, EXA_FREE_TIER_REQUESTS - totalRequests);
  const remainingPct = Math.max(0, 100 - usedPct);
  const bar = progressBar(usedPct, 20);
  out.push("");
  out.push(
    "  " + bar +
      " " + usedPct.toFixed(1).padStart(5) + "% used" +
      "  " + totalRequests + " / " + EXA_FREE_TIER_REQUESTS + " requests" +
      " (" + remaining + " left, " + remainingPct.toFixed(1) + "%)",
  );
  out.push("  Free tier: 20,000 requests/month (Search)");
  for (const k of res.keys) {
    const label = k.name ? "\"" + k.name + "\"" : "(unnamed)";
    const period = k.periodStart && k.periodEnd
      ? "  " + formatIsoDate(k.periodStart) + " → " + formatIsoDate(k.periodEnd)
      : "  (last 30 days)";
    out.push("  Key " + label + " — $" + k.totalCostUsd.toFixed(2) + " spent" + (k.fetchFailed ? "  ⚠ fetch failed" : ""));
    out.push(period);
    for (const b of k.breakdown) {
      out.push("    " + b.priceName + ": " + b.quantity + " qty — $" + b.amountUsd.toFixed(2));
    }
    if (k.budgetCents != null) {
      out.push("    Budget: $" + (k.budgetCents / 100).toFixed(2) + (k.isOverBudget ? "  ⚠ over budget" : ""));
    }
  }
  if (res.keys.length > 1) {
    out.push("  Total across keys: $" + totalAll.toFixed(2));
  }
  return out;
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show API usage + limits (OpenCode Go, Firecrawl, Exa)",
    handler: async function (_args: string, ctx: any) {
      const sections: string[] = [];

      // ── OpenCode Go ──
      const goLines: string[] = ["⚡ OpenCode Go", "─".repeat(55)];
      const apiKey = getApiKey();
      const config = resolveConfig();
      let gotDashboardData = false;

      if (apiKey) {
        const apiResult = await tryUsageApi(apiKey);
        if (apiResult) {
          goLines.push("");
          goLines.push("  (via /zen/go/v1/usage API)");
          goLines.push(buildDashboardOutput(apiResult));
          gotDashboardData = true;
        }
      }

      if (!gotDashboardData && config) {
        const dashResult = await scrapeDashboard(config);
        if (dashResult) {
          goLines.push("");
          goLines.push("  (via dashboard scrape)");
          goLines.push(buildDashboardOutput(dashResult));
          gotDashboardData = true;
        } else {
          goLines.push("");
          goLines.push("  ⚠ Dashboard scrape failed — cookie may have expired");
          goLines.push("    Re-copy the auth cookie from your browser devtools");
        }
      }

      if (apiKey) {
        goLines.push("");
        goLines.push("  Probing model availability...");
        const probe = await probeGoAvailability(apiKey);
        if (probe.ok) {
          goLines.push("  ✓ Available (working model: " + probe.model + ")");
        } else {
          goLines.push("  ✗ " + (probe.error ?? "Unavailable"));
        }
      }

      if (!apiKey) {
        goLines.push("");
        goLines.push("  ⚠ No API key found");
        goLines.push("    Set OPENCODE_API_KEY or add to ~/.pi/agent/auth.json");
      }
      if (!config && !gotDashboardData) {
        goLines.push("");
        goLines.push("  For exact %, configure dashboard credentials:");
        goLines.push("    OPENCODE_GO_WORKSPACE_ID + OPENCODE_GO_AUTH_COOKIE env vars");
        goLines.push("    or ~/.config/opencode/opencode-quota/opencode-go.json");
      }
      sections.push(goLines.join("\n"));

      // ── Firecrawl ──
      const firecrawl = await fetchFirecrawlUsage();
      if (firecrawl) {
        sections.push(buildFirecrawlSection(firecrawl).join("\n"));
      } else if (process.env.FIRECRAWL_API_KEY?.trim()) {
        sections.push(["🔥 Firecrawl", "─".repeat(55), "  ⚠ Failed to fetch usage"].join("\n"));
      } else {
        sections.push([
          "🔥 Firecrawl", "─".repeat(55),
          "  ⚠ FIRECRAWL_API_KEY not set",
          "    Add it to ~/.env_keys",
        ].join("\n"));
      }

      // ── Exa ──
      const exa = await fetchExaUsage();
      if (exa) {
        sections.push(buildExaSection(exa).join("\n"));
      } else if (process.env.EXA_SERVICE_KEY?.trim()) {
        sections.push(["🔎 Exa", "─".repeat(55), "  ⚠ Failed to fetch usage"].join("\n"));
      } else {
        sections.push([
          "🔎 Exa", "─".repeat(55),
          "  ⚠ EXA_SERVICE_KEY not set (separate from EXA_API_KEY)",
          "    Create a service key at https://dashboard.exa.ai/api-keys",
          "    and add EXA_SERVICE_KEY to ~/.env_keys",
        ].join("\n"));
      }

      ctx.ui.notify(sections.join("\n\n"), "info");
    },
  });
}