export type DemoIntent = "REQUEST_STAPLES" | "REQUEST_CHEDDARS" | "SELECT_BORDEN" | "UNKNOWN";

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s.$]/g, " ")
    .replace(/\s+/g, " ");
}

export function parseIntent(raw: string): DemoIntent {
  const t = normalizeUtterance(raw);

  if (
    /\bborden\b/.test(t) ||
    /\b3\.91\b/.test(t) ||
    /\b391\b/.test(t) ||
    /\bcheapest\b/.test(t)
  ) {
    return "SELECT_BORDEN";
  }

  if (
    /\bcheddar\b/.test(t) &&
    /\b(show|different|kinds|have|what|cheeses)\b/.test(t)
  ) {
    return "REQUEST_CHEDDARS";
  }

  const hasMilk = /\bmilk\b/.test(t);
  const hasBread = /\bbread\b/.test(t);
  const hasCheese = /\bcheese\b/.test(t);
  if (hasMilk && hasBread && hasCheese) {
    return "REQUEST_STAPLES";
  }

  return "UNKNOWN";
}
