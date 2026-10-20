import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: './data/rental.db' },
  // Migration files are named by creation time (e.g. 20261012150023_baseline.sql)
  // rather than a sequence number, so parallel branches don't both claim 0017.
  migrations: { prefix: 'timestamp' },
});
