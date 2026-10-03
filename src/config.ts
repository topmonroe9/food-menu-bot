function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`env ${name} is not set`);
  return value;
}

function parseIds(raw: string | undefined): number[] {
  return (raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export const config = {
  botToken: required("BOT_TOKEN"),
  ownerIds: parseIds(process.env.OWNER_IDS),
  webAppUrl: (process.env.WEBAPP_URL ?? "").replace(/\/$/, ""),
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? "./data",
};

if (config.ownerIds.length === 0) {
  console.warn("OWNER_IDS is empty: nobody will have access to the admin panel");
}
