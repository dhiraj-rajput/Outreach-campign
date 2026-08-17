import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

// Load .env.local / .env
function loadEnv() {
  const envFiles = [".env", ".env.local"];
  for (const file of envFiles) {
    const filePath = path.join(__dirname, "..", file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

async function main() {
  loadEnv();

  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "linki";

  console.log(`Connecting to MySQL server at ${host}:${port} as ${user}...`);

  // Connect without database first to ensure DB exists
  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
  } catch (err: any) {
    console.error("❌ Failed to connect to MySQL server:", err.message);
    console.error("Please verify that MySQL is running and your DB_USER / DB_PASSWORD in .env.local are correct.");
    process.exit(1);
  }

  try {
    console.log(`Ensuring database '${database}' exists...`);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${database}\``);

    const sqlPath = path.join(__dirname, "init-mysql.sql");
    console.log(`Executing schema from ${sqlPath}...`);
    const sql = fs.readFileSync(sqlPath, "utf-8");

    await connection.query(sql);

    console.log("✅ MySQL schema initialized successfully!");
  } catch (err: any) {
    console.error("❌ Error initializing schema:", err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
