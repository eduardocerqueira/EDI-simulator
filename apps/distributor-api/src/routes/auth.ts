import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const user = email ? await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } }) : null;
    if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const token = app.jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role });
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  app.get('/me', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });
}
