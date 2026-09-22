import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/patient/page.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");

test("patient page uses the fixed patient id and chat API contract", () => {
  assert.ok(
    pageSource.includes(
      'const TEST_PATIENT_ID = "478504db-9cbe-4a31-b9f2-fd70c02cc95d"',
    ),
  );
  assert.ok(pageSource.includes('fetch("/api/chat"'));
  assert.ok(pageSource.includes('method: "POST"'));
  assert.ok(pageSource.includes("patientId: TEST_PATIENT_ID"));
  assert.ok(pageSource.includes("message: trimmedMessage"));
});

test("patient page includes loading, error, reset and scroll behavior", () => {
  assert.ok(pageSource.includes("正在思考..."));
  assert.ok(pageSource.includes("网络不太好，请再试一次"));
  assert.ok(pageSource.includes('setMessage("")'));
  assert.ok(pageSource.includes("scrollIntoView"));
  assert.ok(pageSource.includes("messagesEndRef"));
});

test("voice control remains visual only", () => {
  const voiceButton = pageSource.slice(
    pageSource.indexOf('aria-label="按住说话"'),
    pageSource.indexOf("</button>", pageSource.indexOf('aria-label="按住说话"')),
  );

  assert.ok(voiceButton.includes("按住说话"));
  assert.ok(!voiceButton.includes("onClick"));
});