import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/report/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("report route reads today's user conversations", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /\.from\("conversations"\)/);
  assert.match(routeSource, /\.eq\("role", "user"\)/);
  assert.match(routeSource, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(routeSource, /Asia\/Shanghai/);
});

test("report route counts matching memories and generates advice", () => {
  assert.match(routeSource, /match_memories/);
  assert.match(routeSource, /p_match_count: 1/);
  assert.match(routeSource, /MIN_SIMILARITY = 0\.5/);
  assert.match(routeSource, /counts\.set/);
  assert.match(routeSource, /generateAdvice/);
  assert.match(routeSource, /今天还没有对话记录/);
});