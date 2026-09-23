import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/login/page.tsx",
  import.meta.url,
);
const formUrl = new URL(
  "../src/app/login/login-form.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const formSource = await readFile(formUrl, "utf8");

test("login page reads server-side Supabase URL and public anon key", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.match(pageSource, /process\.env\.SUPABASE_ANON_KEY/);
  assert.ok(!pageSource.includes("SERVICE_ROLE"));
});

test("login form converts phone to virtual email and uses Supabase Auth", () => {
  assert.ok(formSource.includes("@memory-pal.local"));
  assert.ok(formSource.includes("signUp"));
  assert.ok(formSource.includes("signInWithPassword"));
  assert.ok(formSource.includes("/^\\d{11}$/"));
  assert.ok(formSource.includes("password.length < 6"));
  assert.ok(formSource.includes('router.push("/home")'));
});

test("login buttons avoid translation hydration mismatches", () => {
  assert.ok(formSource.includes("suppressHydrationWarning"));
  assert.ok(formSource.includes('translate="no"'));
  assert.ok(formSource.includes("notranslate"));
});

test("login form shows clear duplicate and credential errors", () => {
  assert.ok(formSource.includes("该手机号已注册"));
  assert.ok(formSource.includes("手机号或密码错误"));
  assert.ok(formSource.includes("min-h-16"));
  assert.ok(formSource.includes("text-xl"));
});