import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/patients/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/patients/patients-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("patients page reads Supabase configuration dynamically", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.match(pageSource, /process\.env\.SUPABASE_ANON_KEY/);
  assert.ok(!pageSource.includes("SERVICE_ROLE"));
});

test("patients page lists all owned patients and marks selection", () => {
  assert.ok(clientSource.includes('.eq("owner_id", userData.user.id)'));
  assert.ok(clientSource.includes("current_patient_id"));
  assert.ok(clientSource.includes("当前选中"));
  assert.ok(clientSource.includes("切换到此患者"));
  assert.ok(clientSource.includes('router.push("/family")'));
  assert.ok(clientSource.includes('role="button"'));
  assert.ok(clientSource.includes("onClick={() => switchPatient(patient.id)}"));
  assert.ok(clientSource.includes("event.stopPropagation()"));
  assert.ok(clientSource.includes('href="/family/bind"'));
  assert.ok(clientSource.includes("添加新患者"));
});

test("patients page is mobile friendly", () => {
  assert.ok(clientSource.includes("text-2xl"));
  assert.ok(clientSource.includes("text-3xl"));
  assert.ok(clientSource.includes("min-h-14"));
  assert.ok(clientSource.includes("max-w-4xl"));
});