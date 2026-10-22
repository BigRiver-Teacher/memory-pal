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

test("chat route answers pure date questions from server computed facts", () => {
  assert.match(routeSource, /function buildDateFacts/);
  assert.match(routeSource, /function isExplicitDateQuestion/);
  assert.match(routeSource, /系统计算的日期，必须严格使用，禁止自行推算/);
  assert.match(routeSource, /日期与星期对照/);
  assert.match(routeSource, /generateDateTimeReply/);
  assert.match(routeSource, /当前时间是 \$\{formatCurrentDateTime\(\)\}/);
  assert.match(routeSource, /这个我记不太清了，您可以问问家里人/);
});

test("chat route keeps personal date facts on the memory path", () => {
  assert.match(routeSource, /PERSONAL_FACT_PATTERN/);

  for (const keyword of ["生日", "纪念日", "体检", "安排", "来访"]) {
    assert.ok(
      routeSource.includes(keyword),
      `个人事实关键词必须包含 ${keyword}`,
    );
  }

  const guardIndex = routeSource.indexOf(
    "PERSONAL_FACT_PATTERN.test(message)",
  );
  const plainDateIndex = routeSource.indexOf(
    "return /几号|几月几|星期几|周几|几点|多少号/.test(message);",
  );

  assert.ok(guardIndex >= 0, "personal fact guard is missing");
  assert.ok(
    plainDateIndex > guardIndex,
    "personal facts must be excluded before the plain date match",
  );
});

test("chat route still retrieves memories for personal datetime questions", () => {
  const datetimeIndex = routeSource.indexOf('if (intent === "datetime")');
  const guardIndex = routeSource.indexOf(
    "if (!isExplicitDateQuestion(body.message))",
  );

  assert.ok(datetimeIndex >= 0);
  assert.ok(guardIndex > datetimeIndex);
  assert.match(routeSource, /dateQuestionMemories/);
  assert.match(
    routeSource,
    /dateQuestionMemories = await retrieveMemories\(/,
  );
});

test("chat route annotates memory dates with weekdays", () => {
  assert.match(routeSource, /function annotateMemoryDates/);
  assert.match(routeSource, /function buildMemoryBlock/);
  assert.match(routeSource, /annotateMemoryDates\(memory\.content, now\)/);
  assert.match(routeSource, /const memoryBlock = buildMemoryBlock\(memories, new Date\(\)\)/);
});

test("chat route keeps memories when entity matching finds nothing", () => {
  assert.match(
    routeSource,
    /return matches\.length > 0 \? matches : memories/,
  );
});

test("chat route never drops the most similar memory during entity filtering", () => {
  // 宠物、物品类问题会被"叫什么"判成 person 意图，如果实体过滤把最相似的
  // 那条一起丢掉，模型就只能编造答案。
  assert.match(routeSource, /memory === memories\[0\] \|\|/);
  assert.match(routeSource, /function filterMemoriesByIntent/);
  assert.match(
    routeSource,
    /const matches = memories\.filter\(\s*\(memory\) =>/,
  );
});

test("chat route passes filtered memories to the reply prompt", () => {
  assert.match(
    routeSource,
    /generateReply\([\s\S]*?filteredMemories,[\s\S]*?conversationHistory/,
  );
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

test("chat route uses Qwen environment configuration", () => {
  assert.match(routeSource, /QWEN_BASE_URL/);
  assert.match(routeSource, /QWEN_API_KEY/);
  assert.match(routeSource, /QWEN_MODEL/);
  assert.match(routeSource, /qwen-plus/);
  assert.match(routeSource, /getQwenApiUrl/);
  assert.match(routeSource, /getQwenModel/);
  assert.ok(!routeSource.includes("DEEPSEEK_API_KEY"));
});

test("chat route keeps memories without entities by matching content", () => {
  assert.match(routeSource, /getMemoryEntityTerms/);
  assert.match(
    routeSource,
    /if \(memory\.entities && memory\.entities\.length > 0\)/,
  );
  assert.match(routeSource, /return \[memory\.content\]/);
  assert.match(routeSource, /getMemoryEntityTerms\(memory\)\.some\(/);
  assert.match(
    routeSource,
    /intent === "location" \? isLocationEntity : isPersonEntity/,
  );
  assert.ok(
    !routeSource.includes("(memory.entities ?? []).some("),
    "legacy memories without entities must not be dropped outright",
  );
});

test("chat route treats first person narration as a story before question rules", () => {
  assert.match(routeSource, /NARRATION_TIME_PATTERN/);
  assert.match(routeSource, /QUESTION_MARKER_PATTERN/);
  assert.match(routeSource, /function isQuestion/);
  assert.match(routeSource, /!isQuestion\(trimmed\)/);

  const narrationIndex = routeSource.indexOf(
    "NARRATION_TIME_PATTERN.test(trimmed)",
  );
  const locationIndex = routeSource.indexOf("哪去|去哪|在哪");
  const personIndex = routeSource.indexOf("谁|叫什么|什么时候来");

  assert.ok(narrationIndex >= 0, "narration check is missing");
  assert.ok(locationIndex >= 0, "location rule is missing");
  assert.ok(personIndex >= 0, "person rule is missing");
  assert.ok(
    narrationIndex < locationIndex && narrationIndex < personIndex,
    "narration must be evaluated before the question keywords",
  );
});

test("chat route covers daily life and festival narration anchors", () => {
  const narrationMatch = routeSource.match(
    /const NARRATION_TIME_PATTERN =\s*\n\s*\/([^/]+)\/;/,
  );

  assert.ok(narrationMatch, "NARRATION_TIME_PATTERN literal is missing");

  const anchors = narrationMatch[1].split("|");

  for (const anchor of ["以前", "昨天", "今天", "中午", "晚上", "中秋", "春节", "国庆"]) {
    assert.ok(
      anchors.includes(anchor),
      `narration anchors must include ${anchor}`,
    );
  }
});
