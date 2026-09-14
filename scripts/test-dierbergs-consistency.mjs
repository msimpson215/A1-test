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
  "notAWebPage"
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
const built = ["demo-static", "public/dierbergs-demo", "public/_next"];
const sources = ["lib", "components", "data", "app"];

execSync("bash scripts/build-demo-static.sh", { stdio: "ignore" });
const bundleDrift = execSync(`git status --porcelain -- ${built.join(" ")}`, { encoding: "utf8" }).trim();
const sourceDrift = execSync(`git status --porcelain -- ${sources.join(" ")}`, { encoding: "utf8" }).trim();

/*
 * Mid-edit, an out-of-date bundle is normal and means nothing. The failure
 * worth catching is a *commit* that changed the source and not the bundle: the
 * source is clean, the rebuild moves, and therefore what is committed cannot
 * be what the site serves.
 */
if (sourceDrift) {
  console.log("SKIP  bundle freshness — source is mid-edit, so nothing to compare against yet");
} else {
  check(
    "what is committed is what the site serves",
    bundleDrift === "",
    bundleDrift
      ? `${bundleDrift.split("\n").length} bundle files move on a rebuild, so the last commit shipped source without it`
      : ""
  );
}

// A rule reaching the shipped bundle is the only proof the shopper hears it.
const chunkDir = "demo-static/_next/static/chunks/app/dierbergs-demo";
const chunk = fs.readdirSync(chunkDir).find((f) => f.startsWith("page-"));
const shipped = fs.readFileSync(`${chunkDir}/${chunk}`, "utf8");
for (const [name, phrase] of Object.entries(fingerprints)) {
  // Phrases without quotes or apostrophes, which the bundler re-escapes.
  check(`"${name}" reaches the shipped bundle`, shipped.includes(phrase), chunk);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
