import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "file:" + (process.env.SQLITE_PATH ?? "./data/pocket.db"),
  },
});
