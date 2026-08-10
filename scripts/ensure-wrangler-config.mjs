import { copyFileSync, existsSync } from "node:fs";

if (!existsSync("wrangler.jsonc")) {
  copyFileSync("wrangler.jsonc.example", "wrangler.jsonc");
  console.log("wrangler.jsonc.example から wrangler.jsonc を生成しました。D1/R2/Discordの実IDを設定してください。");
}
