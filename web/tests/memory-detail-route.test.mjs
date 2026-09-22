import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/memory/[id]/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("memory detail API validates ownership", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /getAuthenticatedUser/);
  assert.match(routeSource, /findOwnedMemory/);
  assert.match(routeSource, /owner_id/);
});

test("memory detail API counts matching questions", () => {
  assert.match(routeSource, /countMemoryQuestions/);
  assert.match(routeSource, /match_memories/);
  assert.match(routeSource, /MIN_SIMILARITY = 0\.5/);
  assert.match(routeSource, /askedCount/);
  assert.match(routeSource, /lastAskedAt/);
});