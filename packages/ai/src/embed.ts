import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";
export const EMBEDDING_DIM = 384;

export type Embedder = {
  embed: (text: string) => Promise<Float32Array>;
};

export function embeddingToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToEmbedding(blob: Buffer): Float32Array {
  const copy = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
  return new Float32Array(copy);
}

export async function createXenovaEmbedder(cacheDir: string): Promise<Embedder> {
  mkdirSync(cacheDir, { recursive: true });
  process.env.TRANSFORMERS_CACHE = join(cacheDir, "transformers");
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
  const mem = new Map<string, Float32Array>();
  return {
    async embed(text: string) {
      const cached = mem.get(text);
      if (cached) {
        return cached;
      }
      const output = await extractor(text, { pooling: "mean", normalize: true });
      const data = zData(output);
      const vec = Float32Array.from(data);
      mem.set(text, vec);
      return vec;
    },
  };
}

function zData(output: unknown): number[] {
  const parsed = z.object({ data: z.unknown() }).safeParse(output);
  if (!parsed.success) {
    throw new Error("unexpected embedding output");
  }
  return z.array(z.number()).parse(Array.prototype.slice.call(parsed.data.data));
}
