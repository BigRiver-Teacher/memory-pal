import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/export/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("export API validates user ownership and export type", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /getAuthenticatedUser/);
  assert.match(routeSource, /owner_id/);
  assert.match(routeSource, /memory.*conversation.*report.*all/);
});

test("export API builds markdown sections", () => {
  assert.match(routeSource, /# 忆伴 · 患者数据导出/);
  assert.match(routeSource, /## 记忆列表/);
  assert.match(routeSource, /## 对话记录/);
  assert.match(routeSource, /## 日报记录/);
  assert.match(routeSource, /text\/markdown/);
});