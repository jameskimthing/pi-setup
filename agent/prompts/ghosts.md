---
description: Find "ghost processes" — dev servers, stale pi sessions, and orphaned build workers that are running but not actually being used. Asks before killing anything.
---

Hunt for ghost processes: processes that look active but aren't really being used. Investigate, then **report findings only** — do NOT kill anything without explicit confirmation from the user.

Run these checks:

1. **Dev servers with no clients.** List listening dev servers (`ss -tlnp`) and match PIDs back to `astro dev`, `vite dev`, `next dev`, `pnpm run dev`, etc. Then check `ss -tnp` for ESTABLISHED connections to each dev port. A server with zero clients is a ghost. Flag duplicate dev servers running the same project on different ports.

2. **Stale `pi` agent sessions.** List every `pi` process with its tty and etime. Check the atime of each `/dev/pts/*` it's on (`stat -c %x`). Sessions idle for many hours / days (nobody touching the terminal) are ghosts. Exclude the current session (the one this prompt is running in) — find it via `tty` or by the most recently started pi process.

3. **Orphaned build workers.** Look for `esbuild --service`, `tsc --watch`, or similar long-lived workers whose parent `pnpm`/`npm`/`astro`/`vite` process is gone (ppid = 1 or dead). These survive their parent being killed.

4. **Sanity checks.** Confirm the parent project of each dev server is actually active (recent git log / status) — a dev server on a project whose last commit was months ago is extra suspicious. Do not flag system services (code-server, caddy, tailscaled, sshd, systemd, snapd, mosh-server, etc.) — those are supposed to run.

Present results as a table: PID, tty, what it is, port (if any), idle/age, why it's a ghost. Group by category (dev servers, stale pi, orphans).

Then ask the user which to kill. Only after confirmation, kill the top-level parent PIDs (so children get reaped), then re-check for orphans that survived (esbuild etc. often need a direct kill) and reap those too. After killing, confirm ports closed and report memory freed.

Never kill anything before the user confirms. Never kill the current session.
