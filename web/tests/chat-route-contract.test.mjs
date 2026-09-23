import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/chat/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("chat route defines the required POST contract", () => {
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /patientId/);
  assert.match(routeSource, /message/);
  assert.match(routeSource, /Response\.json\(\{\s*reply,/);
});

test("chat route keeps the test_chat prompt constraints", () => {
  const requiredFragments = [
    "用温和确认的语气回复长辈",
    "不得编造记忆中没有的信息",
    "不得要求长辈证明记忆或回答身份、时间类测试问题",
    "允许温和的引导式提问",
    "禁止测试性提问",
    "每句回复最多只能包含一个问号",
    "不得出现“过世”“去世”“走了”等词",
    "不得使用“可能”“应该”“大概”“也许”“或许”等推测词",
    "回复不能超过 ${MAX_REPLY_LENGTH} 个字",
  ];

  for (const fragment of requiredFragments) {
    assert.ok(
      routeSource.includes(fragment),
      `Missing prompt fragment: ${fragment}`,
    );
  }

  assert.match(routeSource, /MAX_REPLY_LENGTH = 50/);
  assert.match(routeSource, /countQuestionMarks/);
  assert.match(routeSource, /FORBIDDEN_WORDS/);
  assert.match(routeSource, /SPECULATION_WORDS/);
});

test("chat route uses two memories and supports test mode", () => {
  assert.match(routeSource, /MIN_SIMILARITY = 0\.5/);
  assert.match(routeSource, /p_match_count:\s*5/);
  assert.match(routeSource, /similarity >= MIN_SIMILARITY/);
  assert.match(routeSource, /process\.env\.TEST_MODE/);
  assert.match(
    routeSource,
    /FALLBACK_REPLY\s*=\s*[\s\S]*我不太记得这件事，您可以跟我多说说吗？/,
  );
  assert.match(routeSource, /createSmartClient\(/);
  assert.match(routeSource, /from "supadns-js"/);
  assert.match(routeSource, /supabaseServiceRoleKey/);
});