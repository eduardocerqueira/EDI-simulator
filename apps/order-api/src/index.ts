import { buildApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { bus, publishOutbox } from './outbox.js';
import { seed } from './seed.js';

const log = (m: string) => console.log(`${new Date().toISOString()} INFO  ${m}`);

async function main() {
  await seed();
  await bus.start();
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  log(`[http] order-api listening on :${config.port}`);

  // Outbox relay: publish committed events to RabbitMQ every second.
  const relay = async () => {
    try {
      const n = await publishOutbox();
      if (n) log(`[outbox] published ${n} event(s)`);
    } catch (e) {
      console.warn('[outbox]', (e as Error).message);
    } finally {
      setTimeout(relay, 1000);
    }
  };
  void relay();

  const shutdown = async () => {
    await app.close();
    await bus.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
