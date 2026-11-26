import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { prisma } from './db.js';
import { enqueue } from './outbox.js';

/** Demo restaurant / grocery customers (fictional). */
export const SEED_CUSTOMERS = [
  { email: 'nova@copperleaf.example', name: 'Nova Quill', company: 'Copperleaf Kitchen' },
  { email: 'orin@saltglass.example', name: 'Orin Vale', company: 'Saltglass Grocer' },
  { email: 'pia@tinbell.example', name: 'Pia Marlow', company: 'Tinbell Cafe' },
  { email: 'quentin@emberthyme.example', name: 'Quentin Rook', company: "Ember & Thyme" },
  { email: 'rhea@gullwing.example', name: 'Rhea Solis', company: 'Gullwing Inn' },
  { email: 'silas@crumbworks.example', name: 'Silas Wren', company: 'Crumbworks Bakery' },
  { email: 'tamsin@brightside.example', name: 'Tamsin Holt', company: 'Brightside School Meals' },
  { email: 'ulric@silverspoon.example', name: 'Ulric Dane', company: 'Silverspoon Trattoria' },
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
