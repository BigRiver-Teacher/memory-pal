import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/bind/page.tsx",
  import.meta.url,
);
const formUrl = new URL(
  "../src/app/family/bind/bind-form.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const formSource = await readFile(formUrl, "utf8");

test("family bind page reads Supabase configuration dynamically", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.match(pageSource, /process\.env\.SUPABASE_ANON_KEY/);
  assert.ok(!pageSource.includes("SERVICE_ROLE"));
});

test("family bind form allows multiple patients and selects the new one", () => {
  assert.ok(formSource.includes("supabase.auth.getUser"));
  assert.ok(formSource.includes("owner_id: userId"));
  assert.ok(formSource.includes("family_contact: trimmedContact || null"));
  assert.ok(formSource.includes('"current_patient_id"'));
  assert.ok(formSource.includes("window.localStorage.setItem"));
  assert.ok(formSource.includes('router.replace("/family")'));
  assert.ok(!formSource.includes("only one"));
});

test("family bind form has required nickname and optional contact", () => {
  assert.ok(formSource.includes("长辈昵称"));
  assert.ok(formSource.includes("家属联系方式"));
  assert.ok(formSource.includes("required"));
  assert.ok(formSource.includes("选填"));
  assert.ok(formSource.includes("min-h-16"));
  assert.ok(formSource.includes("text-xl"));
});