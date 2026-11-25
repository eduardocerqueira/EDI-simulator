import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { enqueue } from '../outbox.js';

const publicCustomer = (c: { id: string; email: string; name: string; company: string | null; createdAt: Date }) => ({
  id: c.id, email: c.email, name: c.name, company: c.company, createdAt: c.createdAt,
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const { email, password, name, company } = (req.body ?? {}) as Record<string, string | undefined>;
    if (!email || !password || !name) return reply.code(400).send({ error: 'name, email and password are required' });
    if (password.length < 6) return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    const normalized = email.toLowerCase().trim();
    if (await prisma.customer.findUnique({ where: { email: normalized } })) return reply.code(409).send({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({ data: { email: normalized, name: name.trim(), company: company?.trim() || null, passwordHash } });
      await enqueue(tx, 'customer.registered', { customer: c });
      return c;
    });
    const token = app.jwt.sign({ sub: customer.id, email: customer.email, name: customer.name });
    return reply.code(201).send({ token, user: publicCustomer(customer) });
  });

  app.post('/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as Record<string, string | undefined>;
    const c = email ? await prisma.customer.findUnique({ where: { email: email.toLowerCase().trim() } }) : null;
    if (!c || !password || !(await bcrypt.compare(password, c.passwordHash))) return reply.code(401).send({ error: 'Invalid email or password' });
    return { token: app.jwt.sign({ sub: c.id, email: c.email, name: c.name }), user: publicCustomer(c) };
  });

  app.get('/me', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const c = await prisma.customer.findUnique({ where: { id: req.user.sub } });
    if (!c) return reply.code(401).send({ error: 'Unauthorized' });
    return publicCustomer(c);
  });
}
