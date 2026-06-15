/**
 * OpenCode Go Usage Extension for Pi
 *
 * Adds /usage command to show your OpenCode Go subscription quota.
 *
 * Strategy (in order):
 * 1. Try /zen/go/v1/usage API (currently 404, future-proof)
 * 2. If dashboard credentials configured, scrape for exact percentages
 * 3. Fall back to probing cheap models to check availability
 *
 * Dashboard config (for exact %):
 *   Env: OPENCODE_GO_WORKSPACE_ID + OPENCODE_GO_AUTH_COOKIE
 *   File: ~/.config/opencode/opencode-quota/opencode-go.json
 *         { "workspaceId": "wrk_...", "authCookie": "Fe26.2**..." }
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

// ── Extension ──

export default function (pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show OpenCode Go subscription usage",
    handler: async function (_args: string, ctx: any) {
      const apiKey = getApiKey();
      const config = resolveConfig();

      const lines: string[] = ["⚡ OpenCode Go Usage", "─".repeat(55)];
      let gotDashboardData = false;

      // Source 1: Usage API (future-proof)
      if (apiKey) {
        const apiResult = await tryUsageApi(apiKey);
        if (apiResult) {
          lines.push("");
          lines.push("  (via /zen/go/v1/usage API)");
          lines.push(buildDashboardOutput(apiResult));
          gotDashboardData = true;
        }
      }

      // Source 2: Dashboard scrape
      if (!gotDashboardData && config) {
        const dashResult = await scrapeDashboard(config);
        if (dashResult) {
          lines.push("");
          lines.push("  (via dashboard scrape)");
          lines.push(buildDashboardOutput(dashResult));
          gotDashboardData = true;
        } else {
          lines.push("");
          lines.push("  ⚠ Dashboard scrape failed — cookie may have expired");
          lines.push("    Re-copy the auth cookie from your browser devtools");
        }
      }

      // Source 3: Model probe (always run alongside, or as fallback)
      if (apiKey) {
        lines.push("");
        lines.push("  Probing model availability...");
        const probe = await probeGoAvailability(apiKey);
        if (probe.ok) {
          lines.push("  ✓ Available (working model: " + probe.model + ")");
        } else {
          lines.push("  ✗ " + (probe.error ?? "Unavailable"));
        }
      }

      // Help tips
      if (!apiKey) {
        lines.push("");
        lines.push("  ⚠ No API key found");
        lines.push("    Set OPENCODE_API_KEY or add to ~/.pi/agent/auth.json");
      }
      if (!config && !gotDashboardData) {
        lines.push("");
        lines.push("  For exact %, configure dashboard credentials:");
        lines.push("    OPENCODE_GO_WORKSPACE_ID + OPENCODE_GO_AUTH_COOKIE env vars");
        lines.push("    or ~/.config/opencode/opencode-quota/opencode-go.json");
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}