import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { bus } from './outbox.js';
import { prisma } from './db.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { integrationRoutes } from './routes/integration.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; name: string };
    user: { sub: string; email: string; name: string };
  }
}

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' }, bodyLimit: 5 * 1024 * 1024 });
  // Accept POSTs with `content-type: application/json` and an empty body (e.g. action endpoints).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (e) {
      (e as Error & { statusCode?: number }).statusCode = 400;
      done(e as Error, undefined);
    }
  });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '12h' } });

  app.get('/api/health', async () => {
    const db = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const outboxPending = await prisma.outboxEvent.count({ where: { publishedAt: null } }).catch(() => -1);
    return { status: db ? 'ok' : 'degraded', db, rabbitmq: bus.connected, outboxPending };
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(integrationRoutes, { prefix: '/api/integration' });
  await app.register(async (secured) => {
    secured.addHook('onRequest', async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });
    await secured.register(catalogRoutes);
    await secured.register(orderRoutes);
  }, { prefix: '/api' });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.code(status).send({ error: err.message });
  });
  return app;
}
