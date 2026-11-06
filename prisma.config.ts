import "dotenv/config";
import { defineConfig } from "prisma/config";
import { assertPrismaTargetAllowed } from "./scripts/prisma-db-guard.mjs";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";

/* `.env` holds the production pooler, and `dotenv/config` above loads it, so a
   bare `npx prisma migrate dev` / `db seed` / `studio` used to land on live
   customer data. The guard refuses commands that connect to a remote database
   unless VE_ALLOW_REMOTE_DB=1 is set on purpose. `prisma generate` never
   connects and is unaffected, so cloud builds keep working. */
assertPrismaTargetAllowed(url, process.argv.slice(2), process.env);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url,
  },
});
