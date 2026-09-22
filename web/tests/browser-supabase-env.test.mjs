import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientFiles = [
  "src/app/family/analytics/analytics-client.tsx",
  "src/app/family/bind/bind-form.tsx",
  "src/app/family/family-client.tsx",
  "src/app/family/memory/[id]/memory-detail-client.tsx",
  "src/app/family/patients/patients-client.tsx",
  "src/app/family/report/history/report-history-client.tsx",
  "src/app/family/report/report-client.tsx",
  "src/app/family/settings/settings-client.tsx",
  "src/app/home/home-client.tsx",
  "src/app/login/login-form.tsx",
  "src/app/patient/bind/patient-bind-client.tsx",
  "src/app/patient/patient-client.tsx",
];

test("all browser Supabase clients read NEXT_PUBLIC environment variables", async () => {
  for (const file of clientFiles) {
    const source = await readFile(
      new URL(`../${file}`, import.meta.url),
      "utf8",
    );
    assert.ok(
      source.includes("process.env.NEXT_PUBLIC_SUPABASE_URL"),
      `Missing public URL in ${file}`,
    );
    assert.ok(
      source.includes("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      `Missing public anon key in ${file}`,
    );
  }
});