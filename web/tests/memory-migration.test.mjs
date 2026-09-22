import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202609220001_add_memory_metadata.sql",
  import.meta.url,
);
const migrationSource = await readFile(migrationUrl, "utf8");

test("memory metadata migration adds emotion, entities and source", () => {
  assert.match(migrationSource, /add column if not exists emotion text/);
  assert.match(migrationSource, /add column if not exists entities text\[\]/);
  assert.match(migrationSource, /add column if not exists source text/);
});