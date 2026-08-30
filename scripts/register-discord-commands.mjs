// Discordのギルドコマンド(/shelf)を登録する一度きりのスクリプト。
// コマンド定義を変更した際に再実行する。Workerのデプロイパイプラインには含めない。
//
// 使い方:
//   DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... node scripts/register-discord-commands.mjs

const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID) {
  console.error("DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID を環境変数で指定してください。");
  process.exit(1);
}

const commands = [
  {
    name: "shelf",
    description: "人数とオンライン/リアルから、遊べるボードゲームを1つ提案する",
    options: [
      {
        type: 4, // INTEGER
        name: "players",
        description: "プレイ人数(未指定なら人数で絞り込まない)",
        required: false,
        min_value: 1,
      },
      {
        type: 3, // STRING
        name: "mode",
        description: "オンライン(BGA)かリアルか(未指定ならどちらも対象)",
        required: false,
        choices: [
          { name: "オンライン(BGA)", value: "online" },
          { name: "リアル", value: "real" },
        ],
      },
    ],
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  },
);

if (!res.ok) {
  console.error(`コマンド登録に失敗しました: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log("コマンドを登録しました:", await res.json());
