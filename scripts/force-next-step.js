#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Force a run's next step to fire immediately instead of waiting for the
// normal delay/recheck schedule. Useful when testing a workflow end-to-end
// on a single lead, without waiting hours for the real schedule.
//
// Usage:
//   node scripts/force-next-step.js --run <run_id> --target <target_id> [--apply] [--skip-schedule]
//   node scripts/force-next-step.js --run <run_id> --all-targets [--apply] [--skip-schedule]   (whole run — careful, real sends)
//   node scripts/force-next-step.js --list                                  (list active runs)

const mysql = require("mysql2/promise");

function parseArgs(argv) {
  const args = { apply: false, list: false, allTargets: false, skipSchedule: false, run: null, target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--list") args.list = true;
    else if (a === "--all-targets") args.allTargets = true;
    else if (a === "--skip-schedule") args.skipSchedule = true;
    else if (a === "--run") args.run = argv[++i];
    else if (a === "--target") args.target = argv[++i];
  }
  return args;
}

async function widenSchedule(conn, table, id) {
  const [rows] = await conn.execute(`SELECT active_hours_start, active_hours_end, working_days FROM ${table} WHERE id = ?`, [id]);
  const before = rows[0];
  if (!before) return null;
  await conn.execute(`UPDATE ${table} SET active_hours_start = 0, active_hours_end = 24, working_days = '1,2,3,4,5,6,7' WHERE id = ?`, [id]);
  return before;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "linki",
  });

  try {
    if (args.list) {
      const [runs] = await conn.execute(
        `SELECT r.id, r.status, w.name as workflow_name, r.created_at
         FROM runs r JOIN workflows w ON w.id = r.workflow_id
         WHERE r.status IN ('running', 'paused')
         ORDER BY r.created_at DESC`
      );
      console.log(JSON.stringify(runs, null, 2));
      return;
    }

    if (!args.run) {
      console.error("Usage: node scripts/force-next-step.js --run <run_id> --target <target_id> [--apply]");
      console.error("       node scripts/force-next-step.js --run <run_id> --all-targets [--apply]");
      console.error("       node scripts/force-next-step.js --list");
      process.exit(1);
    }

    if (!args.target && !args.allTargets) {
      console.error("Refusing to run: pass --target <target_id> to scope this to one lead (recommended for testing),");
      console.error("or --all-targets to force the ENTIRE run (every eligible lead fires immediately — real sends).");
      process.exit(1);
    }

    const where = ["rp.run_id = ?"];
    const params = [args.run];
    if (args.target) {
      where.push("rp.target_id = ?");
      params.push(args.target);
    }

    const [tracks] = await conn.execute(
      `SELECT rt.id, rt.track, rt.state, rt.current_step, rt.next_step_at,
              rp.target_id, t.full_name
       FROM run_profile_tracks rt
       JOIN run_profiles rp ON rp.id = rt.run_profile_id
       JOIN targets t ON t.id = rp.target_id
       WHERE ${where.join(" AND ")} AND rt.state != 'completed'`,
      params
    );

    if (!tracks || tracks.length === 0) {
      console.log("No eligible tracks found for that run/target.");
      return;
    }

    console.log(`${args.apply ? "Updating" : "[DRY RUN] Would update"} ${tracks.length} track(s):`);
    for (const t of tracks) {
      console.log(`  - ${t.full_name} (${t.track}, step ${t.current_step}, state=${t.state}) next_step_at: ${t.next_step_at} -> now`);
    }

    if (args.skipSchedule) {
      const [runRows] = await conn.execute("SELECT account_id, email_account_id FROM runs WHERE id = ?", [args.run]);
      const run = runRows[0];
      if (!run) {
        console.error(`No run found with id ${args.run}`);
        process.exit(1);
      }
      if (!args.apply) {
        console.log("\n[DRY RUN] --skip-schedule would widen this run's account(s) to a 24/7 window.");
      } else {
        if (run.account_id) {
          const accountBefore = await widenSchedule(conn, "accounts", run.account_id);
          if (accountBefore) {
            console.log(`Widened LinkedIn account ${run.account_id} to 24/7 (was: ${accountBefore.active_hours_start}-${accountBefore.active_hours_end}, days ${accountBefore.working_days}). Restore this in Settings when done testing.`);
          }
        }
        if (run.email_account_id) {
          const emailBefore = await widenSchedule(conn, "email_accounts", run.email_account_id);
          if (emailBefore) {
            console.log(`Widened email account ${run.email_account_id} to 24/7 (was: ${emailBefore.active_hours_start}-${emailBefore.active_hours_end}, days ${emailBefore.working_days}). Restore this in Settings when done testing.`);
          }
        }
      }
    }

    if (args.apply) {
      for (const t of tracks) {
        await conn.execute("UPDATE run_profile_tracks SET next_step_at = NOW() WHERE id = ?", [t.id]);
      }
      console.log("Done. The runner will pick these up on its next loop tick (a few seconds).");
    } else {
      console.log("\nDry run only — pass --apply to actually update the DB.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
