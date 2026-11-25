import { buildApp } from './app.js';
import { bus } from './bus.js';
import { config } from './config.js';
import { registerConsumers } from './consumers.js';
import { prisma } from './db.js';
import { log } from './log.js';
import { seed } from './seed.js';
import { startWorkers } from './workers.js';

async function main() {
  await seed();
  registerConsumers();
  await bus.start();
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  log.info(`[http] distributor-api listening on :${config.port}`);
  startWorkers();

  const shutdown = async () => {
    log.info('shutting down');
    await app.close();
    await bus.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  log.error('fatal', e);
  process.exit(1);
});
