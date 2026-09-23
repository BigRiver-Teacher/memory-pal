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
  for (const intent of ["location", "person", "memory", "story", "datetime", "other"]) {
    assert.match(routeSource, new RegExp(`"${intent}"`));
  }
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

test("chat route prioritizes high-confidence memories after similarity filtering", () => {
  assert.match(routeSource, /memoryIds/);
  assert.match(routeSource, /\.in\("id", memoryIds\)/);
  assert.match(routeSource, /confidenceById/);
  assert.match(routeSource, /confidence > 0\.7/);
  assert.match(routeSource, /right\.similarity - left\.similarity/);
});

test("chat route filters low-confidence and weak legacy memories", () => {
  assert.match(routeSource, /memory\.confidence !== null/);
  assert.match(routeSource, /memory\.confidence >= 0\.5/);
  assert.match(routeSource, /memory\.similarity >= 0\.5/);
});

test("chat route classifies location and person intents", () => {
  assert.match(routeSource, /"location"/);
  assert.match(routeSource, /"person"/);
  assert.match(routeSource, /哪去\|去哪\|在哪\|什么地方\|哪里\|哪儿/);
  assert.match(routeSource, /谁\|叫什么\|什么时候来/);
  assert.match(routeSource, /classifyIntentByRules/);
});

test("chat route filters location and person memories by entities", () => {
  assert.match(routeSource, /LOCATION_ENTITY_WORDS/);
  assert.match(routeSource, /PERSON_ENTITY_WORDS/);
  assert.match(routeSource, /isLocationEntity/);
  assert.match(routeSource, /isPersonEntity/);
  assert.match(routeSource, /filterMemoriesByIntent/);
  assert.match(routeSource, /memory\.entities/);
  assert.match(routeSource, /filteredMemories\.length > 0/);
});

test("chat prompt allows active care for vulnerable emotions", () => {
  assert.match(routeSource, /孤独、怀念、悲伤/);
  assert.match(routeSource, /主动关心/);
  assert.match(routeSource, /我陪您待一会儿/);
  assert.match(routeSource, /不计入问号数量限制/);
});