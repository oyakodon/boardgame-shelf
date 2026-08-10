import { applyD1Migrations, env } from "cloudflare:test";
import type { Bindings } from "./env";

type TestEnv = Bindings & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

const { DB, TEST_MIGRATIONS } = env as unknown as TestEnv;
await applyD1Migrations(DB, TEST_MIGRATIONS);
