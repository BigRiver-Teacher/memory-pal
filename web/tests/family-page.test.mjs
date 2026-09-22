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
  assert.ok(clientSource.includes('href="/family/patients"'));
  assert.ok(clientSource.includes("← 返回长辈管理"));
  assert.ok(clientSource.includes("切换长辈"));
  assert.ok(clientSource.includes("patientName"));
  assert.ok(clientSource.includes("FamilyNav"));
});

test("family page renders memory metadata and source labels", () => {
  assert.ok(clientSource.includes("emotion"));
  assert.ok(clientSource.includes("entities"));
  assert.ok(clientSource.includes("未分类"));
  assert.ok(clientSource.includes("关联人物"));
  assert.ok(clientSource.includes("家属录入"));
  assert.ok(clientSource.includes("长辈自述"));
});

test("family page supports editing and deleting memories", () => {
  assert.ok(clientSource.includes('method: "PUT"'));
  assert.ok(clientSource.includes('method: "DELETE"'));
  assert.ok(clientSource.includes("Authorization: `Bearer ${accessToken}`"));
  assert.ok(clientSource.includes("确定删除这条记忆吗？删除后无法恢复"));
  assert.ok(clientSource.includes("保存修改"));
  assert.ok(clientSource.includes("`/family/memory/${memory.id}`"));
  assert.ok(clientSource.includes("event.stopPropagation()"));
  assert.ok(clientSource.includes("refreshMemories"));
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