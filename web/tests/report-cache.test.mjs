import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cacheUrl = new URL(
  "../src/lib/report-cache.ts",
  import.meta.url,
);
const cacheSource = await readFile(cacheUrl, "utf8");

test("report cache uses patient and Shanghai date keys", () => {
  assert.ok(cacheSource.includes('REPORT_CACHE_PREFIX = "report_cache_"'));
  assert.ok(cacheSource.includes("getShanghaiDateKey"));
  assert.ok(cacheSource.includes("Asia/Shanghai"));
  assert.ok(cacheSource.includes("getReportCacheKey"));
  assert.ok(cacheSource.includes("readReportCache"));
  assert.ok(cacheSource.includes("writeReportCache"));
});

test("report cache can be cleared for patient and logout", () => {
  assert.ok(cacheSource.includes("clearReportCachesForPatient"));
  assert.ok(cacheSource.includes("clearAllReportCaches"));
  assert.ok(cacheSource.includes("startsWith(REPORT_CACHE_PREFIX)"));
});