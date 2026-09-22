import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/home/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/home/home-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("home page reads Supabase configuration dynamically", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.match(pageSource, /process\.env\.SUPABASE_ANON_KEY/);
  assert.ok(!pageSource.includes("SERVICE_ROLE"));
});

test("home page shows phone and routes family by binding status", () => {
  assert.ok(clientSource.includes("supabase.auth.getUser"));
  assert.ok(clientSource.includes('email.split("@")[0]'));
  assert.ok(clientSource.includes('href="/patient/bind"'));
  assert.ok(clientSource.includes("openFamilyEntry"));
  assert.ok(clientSource.includes(".eq(\"owner_id\", userId)"));
  assert.ok(clientSource.includes('router.push(data && data.length > 0 ? "/family" : "/family/bind")'));
  assert.ok(clientSource.includes("患者端"));
  assert.ok(clientSource.includes("家属端"));
});

test("home page supports logout and mobile-friendly cards", () => {
  assert.ok(clientSource.includes("supabase.auth.signOut"));
  assert.ok(clientSource.includes('router.replace("/login")'));
  assert.ok(clientSource.includes("min-h-56"));
  assert.ok(clientSource.includes("text-4xl"));
  assert.ok(clientSource.includes("md:grid-cols-2"));
});