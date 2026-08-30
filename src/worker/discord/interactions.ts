import type { Game } from "../../shared/types";
import type { AppContext } from "../context";
import { listActiveGames } from "../db";
import { filterRecommendableGames, pickRandomGame, type RecommendMode } from "./recommend";
import { verifyDiscordRequest } from "./verify";

// https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;

// https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE_WITH_SOURCE = 4;

type DiscordInteractionOption = {
  name: string;
  value: string | number;
};

type DiscordInteraction = {
  type: number;
  guild_id?: string;
  data?: {
    name: string;
    options?: DiscordInteractionOption[];
  };
};

function optionValue(options: DiscordInteractionOption[] | undefined, name: string): string | number | undefined {
  return options?.find((option) => option.name === name)?.value;
}

function parseMode(value: string | number | undefined): RecommendMode | undefined {
  return value === "online" || value === "real" ? value : undefined;
}

function gameUrl(requestUrl: string, gameId: string): string {
  return new URL(`/games/${gameId}`, requestUrl).toString();
}

function absoluteUrl(requestUrl: string, path: string): string {
  return new URL(path, requestUrl).toString();
}

function bgaUrl(slug: string): string {
  return `https://boardgamearena.com/gamepanel?game=${encodeURIComponent(slug)}`;
}

function formatPlayers(minPlayers: number, maxPlayers: number | null): string {
  return maxPlayers === null ? `${minPlayers}人〜` : `${minPlayers}〜${maxPlayers}人`;
}

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title: string;
  url: string;
  color: number;
  description: string;
  fields: DiscordEmbedField[];
  thumbnail?: { url: string };
};

function buildRecommendationEmbed(requestUrl: string, game: Game): DiscordEmbed {
  const fields: DiscordEmbedField[] = [{ name: "👤 所有者", value: game.ownerName, inline: true }];

  if (game.bgaSlug !== null) {
    fields.push({
      name: "🎮 BGA",
      value: `[プレイ](${bgaUrl(game.bgaSlug)})`,
      inline: true,
    });
  }

  return {
    title: game.title,
    url: gameUrl(requestUrl, game.id),
    color: 5793266,
    description: `🎲 ${formatPlayers(game.minPlayers, game.maxPlayers)}`,
    fields,
    ...(game.thumbnailUrl ? { thumbnail: { url: absoluteUrl(requestUrl, game.thumbnailUrl) } } : {}),
  };
}

async function buildRecommendationResponse(c: AppContext, options: DiscordInteractionOption[] | undefined) {
  const players = optionValue(options, "players");
  const mode = parseMode(optionValue(options, "mode"));

  const games = await listActiveGames(c.env.DB);
  const candidates = filterRecommendableGames(games, {
    players: typeof players === "number" ? players : undefined,
    mode,
  });
  const picked = pickRandomGame(candidates);

  if (!picked) {
    return { content: "🔍 条件に合うゲームが見つかりませんでした。" };
  }
  return { embeds: [buildRecommendationEmbed(c.req.url, picked)] };
}

// Discord Interactions Endpoint
export async function handleDiscordInteraction(c: AppContext) {
  // 証明書検証
  const signature = c.req.header("X-Signature-Ed25519");
  const timestamp = c.req.header("X-Signature-Timestamp");
  const body = await c.req.text();

  if (!signature || !timestamp) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const verified = await verifyDiscordRequest({ publicKey: c.env.DISCORD_PUBLIC_KEY, signature, timestamp, body });
  if (!verified) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // interaction
  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return c.json({ error: "invalid request body" }, 400);
  }

  if (interaction.type === INTERACTION_TYPE_PING) {
    return c.json({ type: RESPONSE_TYPE_PONG });
  }

  if (interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND) {
    if (interaction.guild_id !== c.env.DISCORD_GUILD_ID) {
      return c.json({ error: "forbidden" }, 403);
    }
    const data = await buildRecommendationResponse(c, interaction.data?.options);
    return c.json({ type: RESPONSE_TYPE_CHANNEL_MESSAGE_WITH_SOURCE, data });
  }

  return c.json({ error: "unsupported interaction type" }, 400);
}
