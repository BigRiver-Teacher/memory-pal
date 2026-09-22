import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/report/page.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");

test("report page contains all three report sections", () => {
  assert.ok(pageSource.includes("今天患者问了什么"));
  assert.ok(pageSource.includes("哪些记忆被反复确认"));
  assert.ok(pageSource.includes("给家属的建议"));
  assert.ok(pageSource.includes("今天还没有对话记录"));
});

test("report page is card-based and mobile friendly", () => {
  assert.ok(pageSource.includes("/api/report?patientId="));
  assert.ok(pageSource.includes("rounded-[28px]"));
  assert.ok(pageSource.includes("text-xl"));
  assert.ok(pageSource.includes("text-2xl"));
  assert.ok(pageSource.includes("max-w-4xl"));
});