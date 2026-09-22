import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/patient/bind/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/patient/bind/patient-bind-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("patient bind page reads Supabase configuration dynamically", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.match(pageSource, /process\.env\.SUPABASE_ANON_KEY/);
  assert.ok(!pageSource.includes("SERVICE_ROLE"));
});

test("patient bind page auto-selects one patient", () => {
  assert.ok(clientSource.includes('.eq("owner_id", userData.user.id)'));
  assert.ok(clientSource.includes("patientRows.length === 1"));
  assert.ok(clientSource.includes('"current_patient_id"'));
  assert.ok(clientSource.includes('router.replace("/patient")'));
});

test("patient bind page lists multiple patients and handles none", () => {
  assert.ok(clientSource.includes("patients.map"));
  assert.ok(clientSource.includes("selectPatient"));
  assert.ok(clientSource.includes('router.push("/patient")'));
  assert.ok(clientSource.includes("请先在家属端绑定患者"));
  assert.ok(clientSource.includes('href="/family/bind"'));
  assert.ok(clientSource.includes("进入患者端"));
});