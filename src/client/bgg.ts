const BGG_PATH_PATTERN = /\/(?:boardgame|boardgameexpansion|boardgameaccessory)\/(\d+)(?:\/|$)/;

export function extractBggId(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)boardgamegeek\.com$/.test(url.hostname)) {
      return null;
    }
    const match = url.pathname.match(BGG_PATH_PATTERN);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}
