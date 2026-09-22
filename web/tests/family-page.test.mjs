import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/family-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("family page uses current_patient_id with first-patient fallback", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.ok(clientSource.includes("supabase.auth.getUser"));
  assert.ok(clientSource.includes('.eq("owner_id", userData.user.id)'));
  assert.ok(clientSource.includes('"current_patient_id"'));
  assert.ok(clientSource.includes("window.localStorage.getItem"));
  assert.ok(clientSource.includes("?? patients[0]"));
  assert.ok(clientSource.includes('router.replace("/family/bind")'));
  assert.ok(clientSource.includes("/api/memory?patientId="));
});

test("family page renders memory metadata and source labels", () => {
  assert.ok(clientSource.includes("emotion"));
  assert.ok(clientSource.includes("entities"));
  assert.ok(clientSource.includes("未分类"));
  assert.ok(clientSource.includes("关联人物"));
  assert.ok(clientSource.includes("家属录入"));
  assert.ok(clientSource.includes("患者自述"));
});

test("family page renders large memory cards and add dialog", () => {
  assert.ok(clientSource.includes("忆伴 · 家属端"));
  assert.ok(clientSource.includes("添加记忆"));
  assert.ok(clientSource.includes("created_at"));
  assert.ok(clientSource.includes("正在保存..."));
  assert.ok(clientSource.includes("rounded-3xl"));
  assert.ok(clientSource.includes("text-xl"));
  assert.ok(clientSource.includes("text-2xl"));
});