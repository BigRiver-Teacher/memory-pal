import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/analytics/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("analytics route aggregates memory emotions", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /\.from\("memories"\)/);
  assert.match(routeSource, /emotionCounts/);
  assert.match(routeSource, /未分类/);
});

test("analytics route aggregates seven days of user questions", () => {
  assert.match(routeSource, /\.from\("conversations"\)/);
  assert.match(routeSource, /\.eq\("role", "user"\)/);
  assert.match(routeSource, /dateOrder/);
  assert.match(routeSource, /questionCounts/);
  assert.match(routeSource, /questionData/);
});