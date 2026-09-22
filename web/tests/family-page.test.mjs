import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/page.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");

test("family page loads and saves memories for the test patient", () => {
  assert.ok(
    pageSource.includes(
      'const TEST_PATIENT_ID = "478504db-9cbe-4a31-b9f2-fd70c02cc95d"',
    ),
  );
  assert.ok(pageSource.includes('fetch('));
  assert.ok(pageSource.includes('`/api/memory?patientId='));
  assert.ok(pageSource.includes('method: "POST"'));
  assert.ok(pageSource.includes("content: trimmedContent"));
});

test("family page renders large memory cards and add dialog", () => {
  assert.ok(pageSource.includes("忆伴 · 家属端"));
  assert.ok(pageSource.includes("添加记忆"));
  assert.ok(pageSource.includes("created_at"));
  assert.ok(pageSource.includes("正在保存..."));
  assert.ok(pageSource.includes("rounded-3xl"));
  assert.ok(pageSource.includes("text-xl"));
  assert.ok(pageSource.includes("text-2xl"));
});