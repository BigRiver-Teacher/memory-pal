import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202609220002_create_reports.sql",
  import.meta.url,
);
const migrationSource = await readFile(migrationUrl, "utf8");

test("reports migration creates cache table and RLS policy", () => {
  assert.match(migrationSource, /create table if not exists public\.reports/);
  assert.match(migrationSource, /patient_id uuid not null/);
  assert.match(migrationSource, /report_date date not null/);
  assert.match(migrationSource, /unique \(patient_id, report_date\)/);
  assert.match(migrationSource, /enable row level security/);
  assert.match(migrationSource, /reports_owner_policy/);
  assert.match(migrationSource, /p\.owner_id = \(select auth\.uid\(\)\)/);
});