import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL(
  "../scripts/test_qwen.py",
  import.meta.url,
);
const source = await readFile(scriptUrl, "utf8");

test("qwen test script reads required environment variables", () => {
  assert.ok(source.includes("get_required_env(QWEN_API_KEY_NAME)"));
  assert.ok(source.includes("get_required_env(QWEN_BASE_URL_NAME)"));
  assert.ok(source.includes('os.environ.get("QWEN_MODEL")'));
  assert.ok(source.includes('QWEN_MODEL_DEFAULT = "qwen-plus"'));
  assert.ok(!source.includes("sk-"));
});

test("qwen test script covers chat and JSON mode", () => {
  assert.ok(source.includes("/chat/completions"));
  assert.ok(source.includes('payload["response_format"] = {"type": "json_object"}'));
  assert.ok(source.includes("range(1, 6)"));
  assert.ok(source.includes("success_count / 5 * 100"));
  assert.ok(source.includes("JSON 成功率"));
});