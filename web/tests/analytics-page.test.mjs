import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/analytics/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/analytics/analytics-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("analytics page resolves current patient and loads API data", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.ok(clientSource.includes("current_patient_id"));
  assert.ok(clientSource.includes("/api/analytics?patientId="));
  assert.ok(clientSource.includes("patientName"));
});

test("analytics page renders pie and line charts", () => {
  assert.ok(clientSource.includes("PieChart"));
  assert.ok(clientSource.includes("LineChart"));
  assert.ok(clientSource.includes("ResponsiveContainer"));
  assert.ok(clientSource.includes("心情占比"));
  assert.ok(clientSource.includes("提问次数变化"));
  assert.ok(clientSource.includes("FamilyNav"));
});

test("analytics page shows supplemental charts and pending states", () => {
  assert.ok(clientSource.includes("情绪趋势"));
  assert.ok(clientSource.includes("记忆增长"));
  assert.ok(clientSource.includes("高频话题"));
  assert.ok(clientSource.includes("活跃时段"));
  assert.ok(clientSource.includes("BarChart"));
  assert.ok(clientSource.includes("数据积累中，再过几天就能看到趋势了。"));
  assert.ok(clientSource.includes("emotionNames"));
  assert.ok(clientSource.includes("topTopics"));
});