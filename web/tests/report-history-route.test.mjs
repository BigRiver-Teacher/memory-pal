import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../src/app/api/report/history/route.ts",
  import.meta.url,
);
const routeSource = await readFile(routeUrl, "utf8");

test("report history API lists last 30 days descending", () => {
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /29 \* DAY_MS/);
  assert.match(routeSource, /\.from\("reports"\)/);
  assert.match(routeSource, /\.order\("report_date", \{ ascending: false \}\)/);
  assert.match(routeSource, /questionCount/);
  assert.match(routeSource, /adviceSummary/);
});