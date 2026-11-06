/**
 * The checks that would have caught what a shopper caught.
 *
 * Every other suite asks whether the code is right. These ask whether the
 * thing that ships is the thing that was written — which is a different
 * question, and the one that went unasked.
 *
 * Two failures made it to a live demo. A liability rule was rewritten in one of
 * three briefs and left wrong in the other two, and a committed fix never
 * reached the site because the browser bundle was not rebuilt. Both are silent,
 * both are structural, and neither can be found by testing behaviour locally.
 *
 *   node scripts/test-dierbergs-consistency.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const rules = JSON.parse(fs.readFileSync("data/dierbergs-shopper-rules.json", "utf8"));
const server = fs.readFileSync("server/server.js", "utf8");
const client = fs.readFileSync("lib/dierbergs-realtime.ts", "utf8");

// ── One rule, three briefs ─────────────────────────────────────────────────
console.log("\n— the rules read the same wherever Axon is briefed —");

const named = Object.keys(rules).filter((k) => !k.startsWith("_"));
check("there are shared rules to check", named.length >= 8, `${named.length} of them`);

/*
 * Each brief is checked for the *reference* to a rule rather than its text,
 * because that is the whole point: no brief is allowed to carry its own copy
 * of the words. If a rule is ever pasted in again, the paste is what fails.
 */
const briefs = [
  ["the voice line, as the browser opens it", client, "lib/dierbergs-realtime.ts"],
  ["the voice line, as the server configures it", server, "server/server.js"],
  ["the typed fallback", server, "server/server.js"]
];

// The rules every brief must carry. Milk-specific wording is not one of them.
const everywhere = [
  "notAClinic",
  "theirAdviceWins",
  "readThePacket",
  "noDisclaimerThenAdvice",
  "a2IsNotLactoseFree",
  "showWhatYouName",
  "countIsTheTotal",
  "noCodes",
  "askingIsNotBuying",
  "notAWebPage",
  "takeItOutMeansAll",
  "emptyMeansEmpty",
  "neverConfirmWhatDidNotHappen",
  "cannotLookThingsUp",
  "showThemAllIfAsked",
  "ownBrandFirstNeverBought"
];

for (const name of everywhere) {
  const uses = (client.match(new RegExp(`rule\\("${name}"\\)`, "g")) || []).length;
  const usesOnServer = (server.match(new RegExp(`'${name}'`, "g")) || []).length;
  check(
    `"${name}" is stitched into the voice line and the typed one`,
    uses >= 1 && usesOnServer >= 2,
    `browser ${uses}, server ${usesOnServer}`
  );
}

/*
 * And nowhere is the text written out by hand. A distinctive phrase from each
 * rule must appear once — in the rules file — and nowhere else.
 */
console.log("\n— and no brief keeps its own copy of them —");
const fingerprints = {
  notAClinic: "you never speak as one",
  noDisclaimerThenAdvice: "it names the risk and takes it",
  showWhatYouName: "has been told nothing they can use",
  countIsTheTotal: "not the number to add",
  readThePacket: "recipes change and you cannot see the packet",
  a2IsNotLactoseFree: "keep it off the shelf when they ask for lactose free"
};
for (const [name, phrase] of Object.entries(fingerprints)) {
  const inClient = client.includes(phrase);
  const inServer = server.includes(phrase);
  check(
    `"${name}" is written down once, not three times`,
    !inClient && !inServer,
    inClient ? "a copy is still in the browser brief" : inServer ? "a copy is still on the server" : ""
  );
}

// ── What ships is what was written ─────────────────────────────────────────
console.log("\n— the site serves the code that is committed —");

/*
 * The demo is a static export, committed to the repository and served from it.
 * So a change to anything the browser runs is invisible until the bundle is
 * rebuilt and that rebuild is committed too. A commit that changes the source
 * and not the bundle deploys nothing, says nothing, and looks exactly like a
 * fix that did not work.
 */
/*
 * Comparing files is no good here: the bundler stamps a fresh build id into the
 * paths every time, so a rebuild always looks like a change even when nothing
 * moved. What matters is not whether the files are identical but whether the
 * rules Axon is meant to follow are actually inside the bundle that is
 * committed — because that bundle, and not the source beside it, is what the
 * browser downloads.
 */
const committedBundle = (() => {
  const listing = execSync(
    "git ls-tree -r --name-only HEAD -- demo-static/_next/static/chunks/app/dierbergs-demo",
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter((f) => f.includes("/page-"));
  if (!listing.length) return { file: null, text: "" };
  const file = listing[listing.length - 1];
  return { file, text: execSync(`git show HEAD:${file}`, { encoding: "utf8", maxBuffer: 64e6 }) };
})();

check(
  "there is a committed bundle for the site to serve",
  Boolean(committedBundle.file),
  committedBundle.file ?? "none found in HEAD"
);

/*
 * Taken from the rules as they read right now, not from a phrase written into
 * this file. A hardcoded phrase is the version of this check that cannot fail:
 * it goes on matching the old wording in the old bundle while the rule itself
 * changes underneath, which is precisely the state it exists to catch.
 *
 * Quotes are avoided because the bundler re-escapes them.
 */
const currentWording = (text) =>
  text
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30 && !/["'\u2019]/.test(sentence));

/*
 * Every sentence, not the longest one. Checking a single sentence per rule
 * leaves the rest of it unguarded: change any other line and the check goes on
 * passing, which is how this exact test failed to catch the thing it was
 * written for the first time round.
 */
const everyRuleWording = Object.fromEntries(
  named.map((name) => [name, currentWording(rules[name])]).filter(([, lines]) => lines.length)
);
const sentenceCount = Object.values(everyRuleWording).reduce((n, lines) => n + lines.length, 0);

check(
  "every rule has wording distinctive enough to look for",
  Object.keys(everyRuleWording).length >= 6 && sentenceCount >= 12,
  `${sentenceCount} sentences across ${Object.keys(everyRuleWording).length} rules`
);

/*
 * Only meaningful once everything is committed. Mid-edit the bundle is
 * expected to lag, and that says nothing. The failure worth shouting about is
 * a clean tree whose committed bundle predates its committed rules — a fix
 * that was written, committed, and never actually shipped.
 */
const treeIsClean = execSync("git status --porcelain", { encoding: "utf8" }).trim() === "";
if (!treeIsClean) {
  console.log("SKIP  the committed bundle — still mid-edit, so it is expected to lag");
} else {
  for (const [name, lines] of Object.entries(everyRuleWording)) {
    const missing = lines.filter((line) => !committedBundle.text.includes(line));
    check(
      `"${name}" reached the bundle, and not only the source`,
      missing.length === 0,
      missing.length ? `committed without rebuilding: "${missing[0].slice(0, 60)}..."` : ""
    );
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
