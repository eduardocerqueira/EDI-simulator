import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { registry } from './metrics.js';
import { bus } from './bus.js';
import { prisma } from './db.js';
import { authRoutes } from './routes/auth.js';
import { ediRoutes } from './routes/edi.js';
import { inventoryRoutes } from './routes/inventory.js';
import { commerceRoutes } from './routes/commerce.js';
import { kpiRoutes } from './routes/kpi.js';
import { notificationRoutes } from './routes/notifications.js';
import { x12Routes } from './routes/x12.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; name: string; role: string };
    user: { sub: string; email: string; name: string; role: string };
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
  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '12h' } });

  app.get('/api/health', async () => {
    const db = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return { status: db ? 'ok' : 'degraded', db, rabbitmq: bus.connected, time: new Date().toISOString() };
  });
  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', registry.contentType);
    return registry.metrics();
  });

  await app.register(authRoutes, { prefix: '/api/auth' });

  // Everything below requires a valid JWT.
  await app.register(async (secured) => {
    secured.addHook('onRequest', async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });
    await secured.register(ediRoutes);
    await secured.register(inventoryRoutes);
    await secured.register(commerceRoutes);
    await secured.register(kpiRoutes);
    await secured.register(notificationRoutes);
    await secured.register(x12Routes);
  }, { prefix: '/api' });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.code(status).send({ error: err.message });
  });
  return app;
}
