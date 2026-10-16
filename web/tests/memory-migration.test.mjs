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
test("memories schema defines emotion, entities and source", () => {
  assert.match(migrationSource, /"?emotion"?\s+"?text"?/i);
  assert.match(migrationSource, /"?entities"?\s+"?text"?\[\]/i);
  assert.match(migrationSource, /"?source"?\s+"?text"?/i);
});
