import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/report/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/report/report-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("report page resolves the current patient", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.ok(clientSource.includes("supabase.auth.getUser"));
  assert.ok(clientSource.includes('.eq("owner_id", userData.user.id)'));
  assert.ok(clientSource.includes("current_patient_id"));
  assert.ok(clientSource.includes("window.localStorage.getItem"));
  assert.ok(clientSource.includes("?? patients[0]"));
  assert.ok(clientSource.includes("/api/report?patientId="));
  assert.ok(clientSource.includes("readReportCache"));
  assert.ok(clientSource.includes("writeReportCache"));
  assert.ok(clientSource.includes("clearReportCachesForPatient"));
  assert.ok(clientSource.includes("刷新日报"));
});

test("report page contains all three report sections", () => {
  assert.ok(clientSource.includes("今天患者问了什么"));
  assert.ok(clientSource.includes("哪些记忆被反复确认"));
  assert.ok(clientSource.includes("给家属的建议"));
  assert.ok(clientSource.includes("今天还没有对话记录"));
});

test("report page has patient management entries and current nickname", () => {
  assert.ok(clientSource.includes('href="/family/patients"'));
  assert.ok(clientSource.includes("← 返回患者管理"));
  assert.ok(clientSource.includes("切换患者"));
  assert.ok(clientSource.includes("当前患者："));
  assert.ok(clientSource.includes("patientName"));
});

test("report page is card-based and mobile friendly", () => {
  assert.ok(clientSource.includes("rounded-[28px]"));
  assert.ok(clientSource.includes("text-xl"));
  assert.ok(clientSource.includes("text-2xl"));
  assert.ok(clientSource.includes("max-w-4xl"));
  assert.ok(clientSource.includes("FamilyNav"));
});