import mysql from "mysql2/promise";

// ---------------------------------------------------------------------------
// Connection pool — single pool shared across all API routes in this process.
// On cPanel (Phusion Passenger / persistent Node) the pool lives for the app
// lifetime; on serverless-ish hosts keep connectionLimit conservative.
// ---------------------------------------------------------------------------

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host:             process.env.DB_HOST     || "localhost",
      port:             parseInt(process.env.DB_PORT || "3306", 10),
      user:             process.env.DB_USER     || "root",
      password:         process.env.DB_PASSWORD || "",
      database:         process.env.DB_NAME     || "linki",
      connectionLimit:  parseInt(process.env.DB_POOL_LIMIT || "10", 10),
      waitForConnections: true,
      queueLimit:       0,
      // charset / collation
      charset:          "utf8mb4",
      timezone:         "Z",  // always store/retrieve datetimes in UTC
    });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Query helpers — typed wrappers that replace the better-sqlite3 .prepare()
// pattern and keep callers concise.
// ---------------------------------------------------------------------------

/**
 * SELECT — returns an array of typed rows.
 *
 * Usage (replaces: db.prepare(sql).all(...params)):
 *   const rows = await dbAll<MyRow>("SELECT * FROM foo WHERE bar = ?", [id]);
 */
export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(sql, params as any[]);
  return rows as T[];
}

/**
 * SELECT single row — returns the first row or null.
 *
 * Usage (replaces: db.prepare(sql).get(...params)):
 *   const row = await dbGet<MyRow>("SELECT * FROM foo WHERE id = ?", [id]);
 */
export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await dbAll<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * INSERT / UPDATE / DELETE — returns the ResultSetHeader.
 *
 * Usage (replaces: db.prepare(sql).run(...params)):
 *   const result = await dbRun("INSERT INTO foo (id, name) VALUES (?, ?)", [id, name]);
 *   result.affectedRows  // rows changed
 *   result.insertId      // auto-increment id (not used since we use UUIDs)
 */
export async function dbRun(
  sql: string,
  params?: unknown[]
): Promise<mysql.ResultSetHeader> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await getPool().query<mysql.ResultSetHeader>(sql, params as any[]);
  return result;
}

/**
 * Execute a raw SQL string (DDL, multi-statement admin, etc.).
 * Use sparingly — prefer dbRun() for DML.
 */
export async function dbExec(sql: string): Promise<void> {
  await getPool().query(sql);
}

/**
 * Transaction helper — runs callback inside BEGIN/COMMIT, rolls back on error.
 *
 * Usage (replaces: db.transaction(() => { ... })() ):
 *   await dbTransaction(async (conn) => {
 *     await conn.execute("INSERT ...", [...]);
 *     await conn.execute("UPDATE ...", [...]);
 *   });
 */
export async function dbTransaction<T>(
  callback: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

let initialised = false;

/**
 * Ensure the database pool is reachable and the schema is up-to-date.
 * Safe to call multiple times — runs only once per process.
 *
 * The actual DDL lives in scripts/init-mysql.sql.  In production you run
 * that script once manually (or via CI).  In development this function
 * runs it automatically so `bun dev` just works against a fresh database.
 *
 * @param autoMigrate  If true (default in development) run init-mysql.sql
 *                     automatically.  Set to false in production if you
 *                     prefer to run migrations out-of-band.
 */
export async function ensureSchema(autoMigrate = process.env.NODE_ENV !== "production"): Promise<void> {
  if (initialised) return;
  initialised = true;

  if (!autoMigrate) return;

  try {
    const { readFileSync, existsSync } = await import("fs");
    const { join }  = await import("path");
    const sqlPath   = join(process.cwd(), "scripts", "init-mysql.sql");
    if (!existsSync(sqlPath)) {
      console.warn("[db] scripts/init-mysql.sql not found — skipping auto-migration");
      return;
    }
    const sql = readFileSync(sqlPath, "utf8");
    // Split on statement delimiter, skipping empty strings
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);

    const conn = await getPool().getConnection();
    try {
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (err: unknown) {
          // Ignore "already exists" errors so this is idempotent
          const code = (err as { code?: string }).code;
          if (
            code === "ER_TABLE_EXISTS_ERROR" ||
            code === "ER_DUP_KEYNAME" ||
            code === "ER_DUP_FIELDNAME" ||
            code === "ER_FK_DUP_NAME"
          ) {
            continue;
          }
          throw err;
        }
      }
      try {
        await conn.query("ALTER TABLE organizations ADD COLUMN invite_code VARCHAR(64) UNIQUE");
      } catch {
        // Column may already exist
      }
      console.log("[db] Schema initialised");
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("[db] Schema initialisation failed:", err);
    // Don't crash the app — the DB might already be set up
  }
}
