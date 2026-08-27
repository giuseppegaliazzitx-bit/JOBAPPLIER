import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

export function loadEnvFile(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv.config({ path });
      return;
    }
  }
  dotenv.config();
}
