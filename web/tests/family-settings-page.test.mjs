import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/settings/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/settings/settings-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("settings page reads Supabase configuration dynamically", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.match(pageSource, /process\.env\.SUPABASE_ANON_KEY/);
  assert.ok(!pageSource.includes("SERVICE_ROLE"));
});

test("settings page updates family nickname in auth metadata", () => {
  assert.ok(clientSource.includes("supabase.auth.updateUser"));
  assert.ok(clientSource.includes("nickname"));
  assert.ok(clientSource.includes("user_metadata"));
  assert.ok(clientSource.includes("email.split(\"@\")[0]"));
});

test("settings page shows current patient and navigation entries", () => {
  assert.ok(clientSource.includes('.eq("owner_id", userData.user.id)'));
  assert.ok(clientSource.includes("current_patient_id"));
  assert.ok(clientSource.includes("family_contact"));
  assert.ok(clientSource.includes("未填写"));
  assert.ok(clientSource.includes("联系方式："));
  assert.ok(clientSource.includes("绑定时间"));
  assert.ok(clientSource.includes('href="/family/patients"'));
  assert.ok(clientSource.includes('href="/patient/bind"'));
  assert.ok(clientSource.includes("FamilyNav"));
});

test("settings page contains about and logout", () => {
  assert.ok(clientSource.includes("阿尔茨海默症家庭"));
  assert.ok(clientSource.includes("v0.1.0"));
  assert.ok(clientSource.includes("supabase.auth.signOut"));
  assert.ok(clientSource.includes('router.replace("/login")'));
});