import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/memory/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("memory route supports GET and POST with server-side credentials", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(routeSource, /SILICONFLOW_API_KEY/);
  assert.match(routeSource, /createEmbedding/);
});

test("memory route extracts emotion and entities for family memories", () => {
  assert.match(routeSource, /extractMemoryMetadata/);
  assert.match(routeSource, /response_format: \{ type: "json_object" \}/);
  assert.match(routeSource, /emotion: metadata\.emotion \|\| null/);
  assert.match(routeSource, /entities: metadata\.entities/);
  assert.match(routeSource, /source: "family"/);
});

test("memory route checks duplicates before inserting", () => {
  assert.match(routeSource, /findExistingMemory/);
  assert.match(routeSource, /\.eq\("content", content\)/);
  assert.match(routeSource, /duplicate: true/);
  assert.match(routeSource, /\.insert\(/);
  assert.match(routeSource, /embedding,/);
});