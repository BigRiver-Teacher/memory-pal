import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/family/memory/[id]/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/family/memory/[id]/memory-detail-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("memory detail page reads the id and renders full memory data", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /params: Promise<\{ id: string \}>/);
  assert.ok(clientSource.includes("/api/memory/"));
  assert.ok(clientSource.includes("memory.content"));
  assert.ok(clientSource.includes("memory?.emotion"));
  assert.ok(clientSource.includes("memory?.entities"));
  assert.ok(clientSource.includes("memory?.source"));
  assert.ok(clientSource.includes("memory.created_at"));
  assert.ok(clientSource.includes("memory.askedCount"));
  assert.ok(clientSource.includes("memory.lastAskedAt"));
});

test("memory detail page supports edit delete and return navigation", () => {
  assert.ok(clientSource.includes('href="/family"'));
  assert.ok(clientSource.includes("← 返回记忆列表"));
  assert.ok(clientSource.includes('method: "PUT"'));
  assert.ok(clientSource.includes('method: "DELETE"'));
  assert.ok(clientSource.includes("确定删除这条记忆吗？删除后无法恢复"));
  assert.ok(clientSource.includes("FamilyNav"));
});