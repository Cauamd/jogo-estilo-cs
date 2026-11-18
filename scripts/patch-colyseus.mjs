import { readFile, writeFile } from "node:fs/promises";
// Colyseus 0.16 imports nanoid 2's default export. The security override installs
// nanoid 3.3.18, whose identical generator is exposed as a named export.
// Keep this small compatibility change reproducible after npm ci, for ESM and CJS.
const root = new URL(
  "../node_modules/@colyseus/core/build/utils/",
  import.meta.url,
);
for (const [file, before, after] of [
  [
    "Utils.mjs",
    'import nanoid from "nanoid";',
    'import { nanoid } from "nanoid";',
  ],
  ["Utils.js", "import_nanoid.default", "import_nanoid.nanoid"],
]) {
  const path = new URL(file, root),
    source = await readFile(path, "utf8");
  if (source.includes(before))
    await writeFile(path, source.replaceAll(before, after));
  else if (!source.includes(after))
    throw new Error(
      `Unexpected Colyseus API in ${file}; review the nanoid adapter.`,
    );
}
console.log("Colyseus 0.16 / nanoid 3 compatibility verified.");
