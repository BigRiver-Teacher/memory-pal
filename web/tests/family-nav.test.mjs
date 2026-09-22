import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navUrl = new URL(
  "../src/components/FamilyNav.tsx",
  import.meta.url,
);
const settingsUrl = new URL(
  "../src/app/family/settings/page.tsx",
  import.meta.url,
);
const settingsClientUrl = new URL(
  "../src/app/family/settings/settings-client.tsx",
  import.meta.url,
);
const navSource = await readFile(navUrl, "utf8");
const settingsSource = await readFile(settingsUrl, "utf8");
const settingsClientSource = await readFile(settingsClientUrl, "utf8");

test("family navigation has memory, report and settings links", () => {
  assert.ok(navSource.includes('href: "/family"'));
  assert.ok(navSource.includes('href: "/family/report"'));
  assert.ok(navSource.includes('href: "/family/analytics"'));
  assert.ok(navSource.includes('href: "/family/settings"'));
  assert.ok(navSource.includes("grid-cols-4"));
  assert.ok(navSource.includes("usePathname"));
  assert.ok(navSource.includes("prefetch"));
  assert.ok(navSource.includes("<Link"));
  assert.ok(!navSource.includes("<a"));
  assert.ok(navSource.includes('aria-current={isActive ? "page" : undefined}'));
});

test("settings page uses the full settings client with family navigation", () => {
  assert.ok(settingsSource.includes("SettingsClient"));
  assert.ok(settingsClientSource.includes("FamilyNav"));
});