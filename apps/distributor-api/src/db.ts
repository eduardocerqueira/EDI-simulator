import { PrismaClient } from './generated/prisma/index.js';

export const prisma = new PrismaClient({ log: ['warn', 'error'] });

/** Atomically increment a named counter (used for outbound control numbers). */
export async function nextSequence(name: string, start = 1): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Sequence" (name, value) VALUES (${name}, ${start})
    ON CONFLICT (name) DO UPDATE SET value = "Sequence".value + 1
    RETURNING value`;
  return rows[0]!.value;
}
