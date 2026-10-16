import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const helperSource = await readFile(
  new URL("../src/lib/server-env.ts", import.meta.url),
  "utf8",
);

async function collectRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(
        ...(await collectRouteFiles(new URL(`${entry.name}/`, directory))),
      );
      continue;
    }

    if (entry.name === "route.ts") {
      files.push(new URL(entry.name, directory));
    }
  }

  return files;
}

const routeFiles = await collectRouteFiles(
  new URL("../src/app/api/", import.meta.url),
);

test("server env helper separates missing configuration from data errors", () => {
  assert.match(helperSource, /MISSING_ENV_MESSAGE_PREFIX/);
  assert.match(
    helperSource,
    /error\.message\.startsWith\(MISSING_ENV_MESSAGE_PREFIX\)/,
  );
  assert.match(helperSource, /服务端环境变量未配置完整/);
  assert.match(helperSource, /export function describeApiFailure/);
});

test("route files exist for the scan to be meaningful", () => {
  assert.ok(routeFiles.length >= 7, `only found ${routeFiles.length} routes`);
});

test("every api route reports configuration failures distinctly", async () => {
  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    const name = file.pathname.split("/api/")[1];

    assert.ok(
      source.includes('from "@/lib/server-env"'),
      `missing helper import in ${name}`,
    );
    assert.ok(
      source.includes("describeApiFailure(error,"),
      `missing describeApiFailure usage in ${name}`,
    );
    assert.ok(
      !/error: "[^"]*请稍后重试。"/.test(source),
      `a bare error message is still returned by ${name}`,
    );
  }
});