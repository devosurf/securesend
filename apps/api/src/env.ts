const DEFAULT_PORT = 3000;

function read(name: string): string | undefined {
  return process.env[name];
}

function required(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(read("PORT") ?? DEFAULT_PORT),
};
