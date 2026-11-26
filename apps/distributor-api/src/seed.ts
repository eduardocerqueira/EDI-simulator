import bcrypt from 'bcryptjs';
import { PRODUCERS } from '@edi/shared';
import { config } from './config.js';
import { prisma } from './db.js';
import { log } from './log.js';

/** Idempotent seed: admin user + the 10 producers as trading partners. */
export async function seed() {
  await prisma.user.upsert({
    where: { email: config.admin.email },
    create: { email: config.admin.email, name: 'Distributor Admin', role: 'ADMIN', passwordHash: await bcrypt.hash(config.admin.password, 10) },
    update: {},
  });
  for (const p of PRODUCERS) {
    const data = { code: p.code, name: p.name, isaQualifier: p.isaQualifier, isaId: p.isaId, gsCode: p.gsCode, ftpUser: p.ftpUser, specialty: p.specialty, city: p.city, state: p.state };
    // keyed by the stable partner code, so renamed partners (new ISA ID / FTP user) are updated in place
    await prisma.tradingPartner.upsert({ where: { code: p.code }, create: data, update: data });
  }
  log.info(`[seed] admin ${config.admin.email} and ${PRODUCERS.length} trading partners ready`);
}
