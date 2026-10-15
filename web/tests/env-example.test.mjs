import assert from "node:assert/strict";

import { readdir, readFile } from "node:fs/promises";

import test from "node:test";



const webRoot = new URL("../", import.meta.url);

const sourceRoot = new URL("src/", webRoot);



async function collectSourceFiles(directory) {

  const entries = await readdir(directory, { withFileTypes: true });

  const files = [];



  for (const entry of entries) {

    if (entry.isDirectory()) {

      files.push(

        ...(await collectSourceFiles(new URL(`${entry.name}/`, directory))),

      );

      continue;

    }



    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {

      files.push(new URL(entry.name, directory));

    }

  }



  return files;

}



const envNames = new Set();



for (const file of await collectSourceFiles(sourceRoot)) {

  const source = await readFile(file, "utf8");



  for (const match of source.matchAll(/getRequiredEnv\("([A-Z0-9_]+)"\)/g)) {

    envNames.add(match[1]);

  }



  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {

    envNames.add(match[1]);

  }

}



const exampleSource = await readFile(

  new URL(".env.example", webRoot),

  "utf8",

);



test("source declares the environment variables the app depends on", () => {

  assert.ok(envNames.size > 0, "no environment variables were detected");

});



test("every environment variable used by the source is documented", () => {

  for (const name of [...envNames].sort()) {

    assert.match(

      exampleSource,

      new RegExp(`^${name}=`, "m"),

      `Missing ${name} in web/.env.example`,

    );

  }

});



test("environment example keeps placeholders instead of real secrets", () => {

  assert.ok(

    !/sk-[A-Za-z0-9]/.test(exampleSource),

    "must not ship an sk- API key",

  );

  assert.ok(

    !/eyJ[A-Za-z0-9_-]{8,}/.test(exampleSource),

    "must not ship a JWT",

  );

  assert.ok(

    !/sb_publishable_|sb_secret_/.test(exampleSource),

    "must not ship a Supabase publishable or secret key",

  );

});



test("web/.gitignore keeps the committed environment example tracked", async () => {

  const gitignore = await readFile(new URL(".gitignore", webRoot), "utf8");



  assert.ok(gitignore.includes(".env*"));

  assert.ok(gitignore.includes("!.env.example"));

});