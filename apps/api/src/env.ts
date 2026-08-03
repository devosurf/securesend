const DEFAULT_PORT = 3000;

const { DATABASE_URL, PORT } = process.env;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env for development."
  );
}

export const env = {
  databaseUrl: DATABASE_URL,
  port: Number(PORT ?? DEFAULT_PORT),
};
