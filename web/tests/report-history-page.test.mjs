import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/report/history/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/report/history/report-history-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("report history page resolves current patient and loads history", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.ok(clientSource.includes("current_patient_id"));
  assert.ok(clientSource.includes("/api/report/history?patientId="));
  assert.ok(clientSource.includes("最近 30 天"));
});

test("report history items link to dated report pages", () => {
  assert.ok(clientSource.includes("questionCount"));
  assert.ok(clientSource.includes("adviceSummary"));
  assert.ok(clientSource.includes("`/family/report?date="));
  assert.ok(clientSource.includes("最近 30 天还没有日报记录。"));
  assert.ok(clientSource.includes("FamilyNav"));
});