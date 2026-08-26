import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDataDir(): string {
  const fromEnv = process.env.AUTOAPPLY_HOME;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return join(homedir(), ".autoapply");
}

export function resolveDbPath(): string {
  const fromEnv = process.env.AUTOAPPLY_DB;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return join(resolveDataDir(), "autoapply.db");
}
