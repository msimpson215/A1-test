/**
 * A brief as the model receives it, not as it is written.
 *
 * The shared rules are stitched into three briefs from one file, so reading the
 * source of a brief now shows `${rule("notAClinic")}` where a suite is looking
 * for the sentence. Every check about what Axon is told has to expand those
 * first, or it is asserting against a placeholder — which passes and proves
 * nothing, or fails and sends someone hunting a bug that is not there.
 */
import fs from "node:fs";

const RULES = JSON.parse(fs.readFileSync("data/dierbergs-shopper-rules.json", "utf8"));

/** Replaces every rule reference with the text it stands for. */
export function expandRules(source) {
  return source.replace(/\$\{rule\(\s*([^)]*?)\s*\)\}/g, (_whole, args) =>
    args
      .split(",")
      .map((name) => RULES[name.trim().replace(/^['"]|['"]$/g, "")] ?? "")
      .join("\n")
  );
}

/** A file's contents with the rules filled in. */
export function sourceWithRules(path) {
  return expandRules(fs.readFileSync(path, "utf8"));
}

export { RULES };
