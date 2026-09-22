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

test("today page formats date and time with clear hierarchy", () => {
  assert.ok(!pageSource.includes("今天是"));
  assert.ok(pageSource.includes("month: \"long\""));
  assert.ok(pageSource.includes("weekday: \"long\""));
  assert.ok(pageSource.includes("text-6xl font-bold"));
  assert.ok(pageSource.includes("text-5xl font-semibold"));
});

test("today page shows time-based greetings", () => {
  assert.ok(pageSource.includes("早上好，今天感觉怎么样"));
  assert.ok(pageSource.includes("中午好，记得好好吃饭"));
  assert.ok(pageSource.includes("下午好，今天过得还顺利吗"));
  assert.ok(pageSource.includes("晚上好，今天辛苦了"));
  assert.ok(pageSource.includes("夜深了，早点休息"));
});

test("today page shows gentle meal reminders", () => {
  assert.ok(pageSource.includes("早餐时间快到了，记得吃点东西"));
  assert.ok(pageSource.includes("午餐时间快到了，记得吃饭"));
  assert.ok(pageSource.includes("晚餐时间快到了，记得吃饭"));
  assert.ok(pageSource.includes("今天的饭都吃过了，好好休息"));
});

test("today page loads a random memory tip", () => {
  assert.ok(pageSource.includes("current_patient_id"));
  assert.ok(pageSource.includes("/api/memory?patientId="));
  assert.ok(pageSource.includes("Math.random()"));
  assert.ok(pageSource.includes("今天还没有小提示"));
  assert.ok(pageSource.includes("今天的小提示"));
});

test("today page returns to patient conversation", () => {
  assert.ok(pageSource.includes('href="/patient"'));
  assert.ok(pageSource.includes("返回对话"));
});