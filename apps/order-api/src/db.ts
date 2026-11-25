import { PrismaClient, type Prisma } from './generated/prisma/index.js';

export const prisma = new PrismaClient({ log: ['warn', 'error'] });

export async function nextSequence(tx: Prisma.TransactionClient, name: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Sequence" (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = "Sequence".value + 1
    RETURNING value`;
  return rows[0]!.value;
}
