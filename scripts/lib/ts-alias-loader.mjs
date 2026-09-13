/**
 * Lets a plain node test import the app's TypeScript modules.
 *
 * Node strips the types itself; the only thing it does not know is the "@/"
 * alias that tsconfig maps to the repository root. This resolves those, so the
 * pure logic in lib/ and data/ can be tested for what it returns rather than
 * only for how it behaves through a browser.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();

export async function resolve(specifier, context, next) {
  const target = specifier.startsWith("@/")
    ? pathToFileURL(path.join(root, specifier.slice(2))).href
    : specifier;
  try {
    return await next(target, context);
  } catch (err) {
    // TypeScript writes imports without an extension; node insists on one.
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || /\.[a-z]+$/i.test(target)) throw err;
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try {
        return await next(target + ext, context);
      } catch { /* try the next shape */ }
    }
    throw err;
  }
}
