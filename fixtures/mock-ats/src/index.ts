import { buildMockAts } from "./app.ts";

const portRaw = process.env.MOCK_ATS_PORT ?? "8790";
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`MOCK_ATS_PORT must be a positive integer, got ${portRaw}`);
}

const app = await buildMockAts();
await app.listen({ host: "127.0.0.1", port });
