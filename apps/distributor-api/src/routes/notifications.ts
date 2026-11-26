import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { paging, q } from '../http.js';
import type { Prisma } from '../generated/prisma/index.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.NotificationWhereInput = {
      ...(f.unread === 'true' ? { read: false } : {}),
      ...(f.severity ? { severity: f.severity } : {}),
      ...(f.category === 'edi'
        ? { type: { startsWith: 'edi.' } }
        : f.category === 'platform'
          ? { type: { startsWith: 'platform.' } }
          : f.category === 'orders'
            ? { AND: [{ NOT: { type: { startsWith: 'edi.' } } }, { NOT: { type: { startsWith: 'platform.' } } }] }
            : {}),
    };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { read: false } }),
    ]);
    return { items, total, page, pageSize, unread };
  });

  app.post('/notifications/:id/read', async (req) => {
    const { id } = req.params as { id: string };
    await prisma.notification.update({ where: { id }, data: { read: true } });
    return { ok: true };
  });

  app.post('/notifications/read-all', async () => {
    const r = await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
    return { ok: true, updated: r.count };
  });
}
