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
test("reports schema creates the daily cache table", () => {
  assert.match(
    migrationSource,
    /create table if not exists "?public"?\."?reports"?/i,
  );
  assert.match(migrationSource, /"?patient_id"?\s+"?uuid"?\s+not null/i);
  assert.match(migrationSource, /"?report_date"?\s+"?date"?\s+not null/i);
  assert.match(migrationSource, /reports_patient_date_key/i);
  assert.match(
    migrationSource,
    /unique\s*\(\s*"?patient_id"?\s*,\s*"?report_date"?\s*\)/i,
  );
});

test("reports schema enables owner scoped RLS for authenticated users", () => {
  assert.match(
    migrationSource,
    /alter table "?public"?\."?reports"?\s+enable row level security/i,
  );
  assert.match(migrationSource, /reports_owner_policy/i);
  assert.match(
    migrationSource,
    /"?owner_id"?\s*=\s*\(\s*select\s+"?auth"?\."?uid"?\(\)/i,
  );
  assert.match(migrationSource, /to "?service_role"?/i);
});
