const BGG_PATH_PATTERN = /\/(?:boardgame|boardgameexpansion|boardgameaccessory)\/(\d+)(?:\/|$)/;

// 数値文字列を安全な正の整数に正規化する。桁数が多すぎる文字列は
// Number()でInfinityや不正確な浮動小数点数になりうるため(JSON化すると
// Infinityはnullに化けて意図せず値が消える)、ここで弾く。
function toSafePositiveInt(digits: string): number | null {
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function extractBggId(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return toSafePositiveInt(trimmed);
  }

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)boardgamegeek\.com$/.test(url.hostname)) {
      return null;
    }
    const match = url.pathname.match(BGG_PATH_PATTERN);
    return match?.[1] ? toSafePositiveInt(match[1]) : null;
  } catch {
    return null;
  }
}
