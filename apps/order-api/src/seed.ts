import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { prisma } from './db.js';
import { enqueue } from './outbox.js';

/** Demo restaurant / grocery customers (fictional). */
export const SEED_CUSTOMERS = [
  { email: 'alice@freshbistro.local', name: 'Alice Moreau', company: 'Fresh Bistro' },
  { email: 'ben@greengrocer.local', name: 'Ben Okafor', company: 'The Green Grocer' },
  { email: 'carla@cornercafe.local', name: 'Carla Duarte', company: 'Corner Cafe' },
  { email: 'dev@sprouts-kitchen.local', name: 'Dev Patel', company: "Sprout's Kitchen" },
  { email: 'emma@harborinn.local', name: 'Emma Lindqvist', company: 'Harbor Inn' },
  { email: 'felix@urbanbakery.local', name: 'Felix Wagner', company: 'Urban Bakery' },
  { email: 'grace@schoolmeals.local', name: 'Grace Kim', company: 'Valley School Meals' },
  { email: 'hugo@farmtable.local', name: 'Hugo Rossi', company: 'Farm & Table Trattoria' },
];

export async function seed() {
  const hash = await bcrypt.hash(config.seedPassword, 10);
  for (const c of SEED_CUSTOMERS) {
    const exists = await prisma.customer.findUnique({ where: { email: c.email } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: { ...c, passwordHash: hash } });
      await enqueue(tx, 'customer.registered', { customer });
    });
  }
}
