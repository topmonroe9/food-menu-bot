import "./db/index.js";
import { syncOwnersFromEnv } from "./db/admins.js";
import { bot } from "./bot/index.js";
import { setupBotUi } from "./bot/setup.js";
import { startServer } from "./web/server.js";
import { startScheduler } from "./services/scheduler.js";
import { markInterruptedBroadcasts } from "./db/broadcasts.js";

syncOwnersFromEnv();
markInterruptedBroadcasts();
await bot.init();
startServer();

await setupBotUi().catch((err) => console.error("failed to set up bot commands/menu:", err));
startScheduler();

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.start({
  drop_pending_updates: false,
  onStart: (me) => console.log(`bot @${me.username} started`),
});
