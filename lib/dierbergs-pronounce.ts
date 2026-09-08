/**
 * Respellings applied to everything on its way to a voice.
 *
 * Every engine reads "Dierbergs" as "Dye-bergs" or "Dee-bergs". It is the
 * store's name and the word the shopper hears most often, so it has to be
 * right. Done here rather than in the copy so product names are covered too,
 * and so the prefetch and the playback agree on the text and share a cache
 * entry.
 */
export function forSpeaking(text: string): string {
  return text.replace(/\bDierbergs\b/gi, "Deerbergs");
}
