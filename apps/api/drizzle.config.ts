import { defineConfig } from "drizzle-kit";

const { DATABASE_URL } = process.env;

export default defineConfig({
  casing: "snake_case",
  dbCredentials: { url: DATABASE_URL ?? "" },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
