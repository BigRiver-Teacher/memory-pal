import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutUrl = new URL(
  "../src/app/layout.tsx",
  import.meta.url,
);
const cssUrl = new URL(
  "../src/app/globals.css",
  import.meta.url,
);
const layoutSource = await readFile(layoutUrl, "utf8");
const cssSource = await readFile(cssUrl, "utf8");

test("root layout renders a fixed global background layer", () => {
  assert.ok(layoutSource.includes("app-background"));
  assert.ok(layoutSource.includes("fixed inset-0 z-0"));
  assert.ok(layoutSource.includes("pointer-events-none"));
  assert.ok(layoutSource.includes("relative z-10"));
});

test("global background uses warm radial gradients", () => {
  assert.ok(cssSource.includes(".app-background"));
  assert.ok(cssSource.includes("radial-gradient"));
  assert.ok(cssSource.includes("#f7f3ea"));
  assert.ok(cssSource.includes("main {"));
  assert.ok(cssSource.includes("background-color: transparent !important"));
});