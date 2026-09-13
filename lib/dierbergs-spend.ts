/**
 * What a conversation actually cost.
 *
 * The question a retailer asks about a voice assistant is not whether it works
 * but what it costs per shopper, and the honest answer is a measurement rather
 * than an estimate. The Realtime API reports its own usage at the end of every
 * response; this adds those up for the session and prices them, so a two
 * minute conversation ends with a real number instead of an argument.
 *
 * The number that matters for a business model is the one at the bottom: cost
 * per conversation. It tracks how long someone talks, not how big the store
 * is — the catalogue is looked up a handful of products at a time, so a store
 * of forty thousand items costs the same per conversation as this demo's few
 * dozen.
 */

export type SpendTokens = {
  /** Words: instructions, the aisle index, search results, tool traffic. */
  textIn: number;
  /** Their voice, as the model hears it. */
  audioIn: number;
  /** Context charged at the cheaper repeat rate. */
  cachedIn: number;
  textOut: number;
  /** Its voice. The expensive half of a spoken conversation. */
  audioOut: number;
};

/*
 * Dollars per million tokens, from the published Realtime price list. These
 * are the one thing here that goes stale: rates move, and this is the single
 * place to correct them. Everything above is measured.
 */
export const RATES = {
  textIn: 4,
  audioIn: 32,
  cachedIn: 0.4,
  textOut: 16,
  audioOut: 64
} as const;

const zero = (): SpendTokens => ({ textIn: 0, audioIn: 0, cachedIn: 0, textOut: 0, audioOut: 0 });

let tokens = zero();
let turns = 0;

/** The usage block the API sends with response.done, which is loosely typed. */
type RawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    cached_tokens?: number;
    cached_tokens_details?: { text_tokens?: number; audio_tokens?: number };
  };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function recordUsage(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const u = raw as RawUsage;
  const inDetail = u.input_token_details ?? {};
  const outDetail = u.output_token_details ?? {};

  const cached = num(inDetail.cached_tokens);
  let textIn = num(inDetail.text_tokens);
  let audioIn = num(inDetail.audio_tokens);

  /*
   * The detail lines count cached tokens too, and cached tokens are billed at
   * a tenth of the rate. Take them off the full-price lines so the same token
   * is not charged twice, splitting them the way the input itself splits when
   * the API does not break the cache down for us.
   */
  if (cached > 0) {
    const full = textIn + audioIn;
    const share = full > 0 ? Math.min(cached, full) : 0;
    const cachedText = full > 0 ? Math.round((share * textIn) / full) : 0;
    textIn -= num(inDetail.cached_tokens_details?.text_tokens) || cachedText;
    audioIn -= num(inDetail.cached_tokens_details?.audio_tokens) || (share - cachedText);
  }

  tokens.textIn += Math.max(0, textIn);
  tokens.audioIn += Math.max(0, audioIn);
  tokens.cachedIn += cached;
  tokens.textOut += num(outDetail.text_tokens);
  tokens.audioOut += num(outDetail.audio_tokens);
  turns += 1;
}

export function dollarsFor(t: SpendTokens): number {
  return (
    (t.textIn * RATES.textIn +
      t.audioIn * RATES.audioIn +
      t.cachedIn * RATES.cachedIn +
      t.textOut * RATES.textOut +
      t.audioOut * RATES.audioOut) /
    1_000_000
  );
}

export function spendReport(): { turns: number; tokens: SpendTokens; total: number; dollars: number } {
  const total =
    tokens.textIn + tokens.audioIn + tokens.cachedIn + tokens.textOut + tokens.audioOut;
  return { turns, tokens: { ...tokens }, total, dollars: dollarsFor(tokens) };
}

/** Money reads badly rounded to cents when a whole conversation is a fraction of one. */
export function money(dollars: number): string {
  if (dollars <= 0) return "$0.00";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

export function resetSpend(): void {
  tokens = zero();
  turns = 0;
}
