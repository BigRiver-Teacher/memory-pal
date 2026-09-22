import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/patient/today/page.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");

test("today page refreshes current time every minute", () => {
  assert.ok(pageSource.includes("window.setInterval"));
  assert.ok(pageSource.includes("60000"));
  assert.ok(pageSource.includes("window.clearInterval"));
  assert.ok(pageSource.includes("suppressHydrationWarning"));
});

test("today page calculates breakfast lunch and dinner reminders", () => {
  assert.ok(pageSource.includes("8 * 60"));
  assert.ok(pageSource.includes("12 * 60"));
  assert.ok(pageSource.includes("18 * 60"));
  assert.ok(pageSource.includes("距离${nextMeal.label}还有"));
  assert.ok(pageSource.includes("今天的饭都吃过了，早点休息"));
});

test("today page returns to patient conversation", () => {
  assert.ok(pageSource.includes('href="/patient"'));
  assert.ok(pageSource.includes("返回对话"));
});