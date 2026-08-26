import { openSqlite } from "./client.ts";
import { migrate } from "./migrate.ts";
import { resolveDbPath } from "./paths.ts";

const dbPath = resolveDbPath();
const sqlite = openSqlite(dbPath);
try {
  const ran = migrate(sqlite);
  const message =
    ran.length === 0
      ? `migrations already applied (${dbPath})`
      : `applied ${ran.join(", ")} (${dbPath})`;
  process.stdout.write(`${message}\n`);
} finally {
  sqlite.close();
}
