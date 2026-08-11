const BGA_SLUG_PATTERN = /^[a-z0-9_-]{1,64}$/;

export function extractBgaSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (BGA_SLUG_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)boardgamearena\.com$/.test(url.hostname)) {
      return null;
    }
    const slug = url.searchParams.get("game");
    return slug && BGA_SLUG_PATTERN.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function bgaUrl(slug: string): string {
  return `https://boardgamearena.com/gamepanel?game=${encodeURIComponent(slug)}`;
}
