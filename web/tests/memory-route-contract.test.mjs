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

test("memory route supports authenticated update and delete", () => {
  assert.match(routeSource, /export async function PUT/);
  assert.match(routeSource, /export async function DELETE/);
  assert.match(routeSource, /getAuthenticatedUser/);
  assert.match(routeSource, /findOwnedMemory/);
  assert.match(routeSource, /owner_id/);
  assert.match(routeSource, /extractMemoryMetadata\(content\)/);
  assert.match(routeSource, /createEmbedding\(content\)/);
});

test("memory route checks duplicates before inserting", () => {
  assert.match(routeSource, /findExistingMemory/);
  assert.match(routeSource, /\.eq\("content", content\)/);
  assert.match(routeSource, /duplicate: true/);
  assert.match(routeSource, /\.insert\(/);
  assert.match(routeSource, /embedding,/);
});

test("memory extraction uses strict schema and low-confidence gating", () => {
  assert.match(routeSource, /"confidence":0\.0/);
  assert.match(routeSource, /source_text/);
  assert.match(routeSource, /source_offset/);
  assert.match(routeSource, /entity && content\.includes\(entity\)/);
  assert.match(routeSource, /metadata\.confidence < 0\.5/);
  assert.match(routeSource, /status: "待确认"/);
});