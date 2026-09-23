import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202609230001_add_memory_extraction_fields.sql",
  import.meta.url,
);
const migrationSource = await readFile(migrationUrl, "utf8");

test("memory extraction migration adds confidence and source fields", () => {
  assert.match(migrationSource, /add column if not exists confidence double precision/);
  assert.match(migrationSource, /add column if not exists source_text text/);
  assert.match(migrationSource, /add column if not exists source_offset integer/);
  assert.match(migrationSource, /confidence >= 0 and confidence <= 1/);
});