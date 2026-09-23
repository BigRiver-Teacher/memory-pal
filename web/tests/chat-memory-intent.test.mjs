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

test("chat route recognizes datetime intent with keyword fallback", () => {
  assert.match(routeSource, /"memory" \| "story" \| "datetime" \| "other"/);
  assert.match(routeSource, /isDateTimeQuestion/);
  assert.match(routeSource, /几号\|星期几\|周几\|几点\|什么时候/);
  assert.match(routeSource, /中秋/);
  assert.match(routeSource, /春节/);
  assert.match(routeSource, /国庆/);
});

test("chat route answers datetime without memory retrieval", () => {
  const datetimeIndex = routeSource.indexOf('if (intent === "datetime")');
  const embeddingIndex = routeSource.indexOf(
    "const queryEmbedding = await createEmbedding",
  );

  assert.ok(datetimeIndex >= 0);
  assert.ok(embeddingIndex >= 0);
  assert.ok(datetimeIndex < embeddingIndex);
  assert.match(routeSource, /generateDateTimeReply/);
  assert.match(routeSource, /当前时间是 \$\{formatCurrentDateTime\(\)\}/);
  assert.match(routeSource, /这个我记不太清了，您可以问问家里人/);
});

test("chat route keeps story extraction and storage", () => {
  assert.match(routeSource, /intent === "story"/);
  assert.match(routeSource, /extractMemoryAnchors/);
  assert.match(routeSource, /storeStoryMemory/);
  assert.match(routeSource, /source: "patient"/);
  assert.match(routeSource, /response_format: \{ type: "json_object" \}/);
});

test("chat route loads and orders recent conversation context", () => {
  assert.match(routeSource, /getRecentConversationContext/);
  assert.match(routeSource, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(routeSource, /\.limit\(6\)/);
  assert.match(routeSource, /\.reverse\(\)/);
  assert.match(routeSource, /\.in\("role", \["user", "assistant"\]\)/);
});

test("chat route uses context for intent and reply messages", () => {
  assert.match(routeSource, /contextSuggestsDateTime/);
  assert.match(routeSource, /conversationHistory/);
  assert.match(routeSource, /\.\.\.conversationHistory/);
  assert.match(routeSource, /最近对话只用于理解当前问题，不要主动复述历史/);
  assert.match(
    routeSource,
    /generateReply\([\s\S]*conversationHistory/,
  );
});

test("story extraction writes confidence and source grounding", () => {
  assert.match(routeSource, /MemoryExtraction/);
  assert.match(routeSource, /"confidence":0\.0/);
  assert.match(routeSource, /entity && message\.includes\(entity\)/);
  assert.match(routeSource, /metadata\.confidence >= 0\.5/);
  assert.match(routeSource, /source_text: metadata\.source_text/);
  assert.match(routeSource, /source_offset: metadata\.source_offset/);
  assert.match(routeSource, /memoryPending/);
});