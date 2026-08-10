#!/usr/bin/env node
/*
 * scripts/with-configured-port.js — wraps `next dev` / `next start`.
 *
 * Every absolute link the app generates (unsubscribe links, click/open tracking pixels,
 * OAuth redirects, …) is built from NEXTAUTH_URL (see lib/email/suppression.ts,
 * lib/email/tracking.ts). But Next's own CLI does NOT read .env/.env.local to decide which
 * port to bind — it only looks at an actual PORT environment variable (or `-p`). If
 * NEXTAUTH_URL says :3456 and nobody has PORT=3456 set in the shell, `next dev` silently
 * binds :3000 instead, and every link in a sent email 404s / connection-refuses.
 *
 * This script reads NEXTAUTH_URL out of .env.local (falling back to .env), extracts its
 * port, and passes that as PORT to the real `next` command — so the server always listens
 * on the same port the app is telling recipients to use. An explicit PORT already in the
 * environment (e.g. `PORT=4000 npm run dev`, or a host like Docker/Render setting it) always
 * wins and is left untouched.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function resolvePort() {
  if (process.env.PORT) return null; // already explicit — don't override

  const root = path.join(__dirname, "..");
  const env = { ...readEnvFile(path.join(root, ".env")), ...readEnvFile(path.join(root, ".env.local")) };
  const nextauthUrl = env.NEXTAUTH_URL;
  if (!nextauthUrl) return null;

  try {
    const url = new URL(nextauthUrl);
    if (url.port) return url.port;
  } catch {
    // malformed NEXTAUTH_URL — let next fall back to its own default
  }
  return null;
}

const args = process.argv.slice(2); // e.g. ["dev"] or ["start"]
const port = resolvePort();
const env = { ...process.env };
if (port) {
  env.PORT = port;
  console.log(`[with-configured-port] NEXTAUTH_URL points at port ${port} — starting Next on the same port.`);
}

const rootDir = path.join(__dirname, "..");
const bin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");

const result = spawnSync(fs.existsSync(bin) ? bin : "next", args, { stdio: "inherit", env });
process.exit(result.status ?? 0);
