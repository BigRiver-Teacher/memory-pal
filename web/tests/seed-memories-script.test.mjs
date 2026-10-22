import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MEMORY_SEEDS } from "../scripts/seed-memories.mjs";

const scriptUrl = new URL("../scripts/seed-memories.mjs", import.meta.url);
const checksUrl = new URL("../scripts/seed-chat-checks.json", import.meta.url);

const source = await readFile(scriptUrl, "utf8");
const checks = JSON.parse(await readFile(checksUrl, "utf8"));

test("seed script ships at least 25 unique memories", () => {
  assert.ok(
    MEMORY_SEEDS.length >= 25,
    `期望至少 25 条记忆，实际 ${MEMORY_SEEDS.length}`,
  );
  assert.equal(
    new Set(MEMORY_SEEDS).size,
    MEMORY_SEEDS.length,
    "记忆内容不能重复，否则查重会把它当成同一条",
  );
  for (const content of MEMORY_SEEDS) {
    assert.equal(typeof content, "string");
    assert.ok(content.trim().length > 0);
  }
});

test("seed script keeps credentials out of the repository", () => {
  assert.ok(!source.includes("sk-"));
  assert.ok(!source.includes("SERVICE_ROLE"));
  // anon key 是公开信息，可以出现在脚本里；service role key 不行。
  assert.ok(source.includes("DEFAULT_SUPABASE_ANON_KEY"));
  assert.ok(!source.includes("eyJ"));
});

test("seed script reuses the deployed memory pipeline instead of reimplementing it", () => {
  assert.ok(source.includes("/api/memory"));
  assert.ok(source.includes("/api/chat"));
  assert.ok(source.includes("/auth/v1/token?grant_type=password"));
  assert.ok(source.includes("@memory-pal.local"));
  assert.ok(!source.includes("api.siliconflow.cn"));
  assert.ok(!source.includes("api.deepseek.com"));
});

test("seed script is idempotent and reports unconfirmed writes", () => {
  assert.ok(source.includes("duplicate"));
  assert.ok(source.includes("PENDING_STATUS = 202"));
  assert.ok(source.includes("pending"));
  assert.ok(source.includes("findPatient"));
  assert.ok(source.includes("createPatient"));
  assert.ok(source.includes("ensurePatient"));
});

test("seed script supports dry-run, chat-only and site override", () => {
  assert.ok(source.includes('"--dry-run"'));
  assert.ok(source.includes('"--chat-only"'));
  assert.ok(source.includes("chatOnly"));
  assert.ok(source.includes("dryRun"));
  assert.ok(source.includes("DEFAULT_SITE_URL"));
  assert.ok(source.includes('key === "site"'));
});

test("seed script retries transient chat failures", () => {
  assert.ok(source.includes("for (let attempt = 0; attempt < 2; attempt += 1)"));
  assert.ok(source.includes("if (result.status < 500)"));
});

test("chat checks cover the intent families the chat route routes on", () => {
  assert.ok(checks.length >= 8, `期望至少 8 条问答自检，实际 ${checks.length}`);

  const intents = new Set(checks.map((check) => check.intent));
  for (const intent of ["person", "location", "memory", "datetime"]) {
    assert.ok(intents.has(intent), `缺少 ${intent} 意图的问答自检`);
  }

  for (const check of checks) {
    assert.equal(typeof check.question, "string");
    assert.ok(check.question.trim().length > 0);
    assert.ok(Array.isArray(check.expect) && check.expect.length > 0);
  }
});

test("chat checks answer from seeded memories", () => {
  const joined = MEMORY_SEEDS.join("\n");

  for (const check of checks) {
    assert.ok(
      check.expect.some((keyword) => joined.includes(keyword)),
      `问答「${check.question}」的期望关键词没有一个出现在种子记忆里`,
    );
  }
});