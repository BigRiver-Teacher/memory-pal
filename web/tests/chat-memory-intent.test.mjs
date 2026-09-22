import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/chat/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("chat route filters memory similarity and keeps the fallback", () => {
  assert.match(routeSource, /MIN_SIMILARITY = 0\.5/);
  assert.match(routeSource, /p_match_count:\s*5/);
  assert.match(routeSource, /similarity >= MIN_SIMILARITY/);
  assert.match(routeSource, /FALLBACK_REPLY/);
});

test("chat route injects the current date and date-question rule", () => {
  assert.match(routeSource, /formatCurrentDateTime/);
  assert.match(routeSource, /Asia\/Shanghai/);
  assert.match(routeSource, /当前时间是 \$\{currentDateTime\}/);
  assert.match(
    routeSource,
    /如果患者问今天几号、星期几，直接根据“当前时间”回答/,
  );
  assert.match(routeSource, /isCurrentDateTimeQuestion/);
  assert.match(routeSource, /memoriesForPrompt/);
});

test("chat route extracts story intent and stores memories safely", () => {
  assert.match(routeSource, /classifyPatientIntent/);
  assert.match(routeSource, /intent === "story"/);
  assert.match(routeSource, /response_format: \{ type: "json_object" \}/);
  assert.match(routeSource, /extractMemoryAnchors/);
  assert.match(routeSource, /entities: string\[\]/);
  assert.match(routeSource, /emotion: string/);
  assert.match(routeSource, /storeStoryMemory/);
  assert.match(routeSource, /\.eq\("content", message\)/);
  assert.match(routeSource, /content: message/);
  assert.match(routeSource, /if \(!isTestMode\)/);
});