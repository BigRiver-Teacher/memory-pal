import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// Supabase CLI 管理的迁移会随 `db pull` 增删文件，因此这里读取整个
// migrations 目录，并按"不区分大小写、标识符引号可选"的方式断言。
const migrationsUrl = new URL("../../supabase/migrations/", import.meta.url);

const migrationSource = (
  await Promise.all(
    (await readdir(migrationsUrl))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFile(new URL(name, migrationsUrl), "utf8")),
  )
).join("\n");
test("memories schema defines confidence and source grounding fields", () => {
  assert.match(migrationSource, /"?confidence"?\s+double precision/i);
  assert.match(migrationSource, /"?source_text"?\s+"?text"?/i);
  assert.match(migrationSource, /"?source_offset"?\s+integer/i);
});

test("memories confidence is constrained to the 0-1 range", () => {
  assert.match(migrationSource, /memories_confidence_range/i);
  assert.match(migrationSource, /"?confidence"?\s+is\s+null/i);
  assert.match(
    migrationSource,
    /"?confidence"?\s*<=\s*\(?1\)?::double precision/i,
  );
});
