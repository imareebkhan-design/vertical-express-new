import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },

  experimental: {
    /**
     * Static generation concurrency, sized to the database connection pool.
     *
     * `generateStaticParams` prerenders every published product page — around 45
     * today and growing with the catalogue. Each one runs Prisma queries, and
     * `DATABASE_URL` points at the Supabase pooler with `connection_limit=5` and
     * a 10s pool timeout. At Next's default concurrency the build opened more
     * concurrent queries than the pool allows, and pages failed with:
     *
     *   Timed out fetching a new connection from the connection pool
     *
     * It failed on a different product each run, which is the signature of pool
     * exhaustion rather than a bad page. Because `vercel-build` runs `next build`,
     * a flaky prerender is a flaky deploy.
     *
     * Concurrency is held below the connection limit so queued pages wait on the
     * scheduler instead of racing for a connection. The retry covers a genuinely
     * slow response rather than masking a real error — a page that fails twice
     * still fails the build.
     */
    staticGenerationMaxConcurrency: 2,
    staticGenerationRetryCount: 2,
  },
};

export default nextConfig;
