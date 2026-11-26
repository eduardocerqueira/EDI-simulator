import { config } from './config.js';
import { pollInboxes } from './ftp.js';
import { log } from './log.js';
import { metrics } from './metrics.js';
import { sendPendingAcks } from './pipeline/acks.js';
import { deliverPending } from './pipeline/delivery.js';
import { processFile } from './pipeline/process.js';
import { syncActionItems } from './actions/backlog.js';
import { resend } from './email/resend.js';
import { producerWorld } from './email/world.js';

/** Run `fn` forever, `everyMs` after each completion (never overlapping). */
function loop(name: string, everyMs: number, fn: () => Promise<unknown>) {
  const tick = async () => {
    try {
      await fn();
    } catch (e) {
      log.warn(`[${name}] ${(e as Error).message}`);
    } finally {
      setTimeout(tick, everyMs);
    }
  };
  setTimeout(tick, 1000);
}

export function startWorkers() {
  if (config.ftp.enabled) {
    loop('ftp-poller', config.ftp.pollIntervalMs, async () => {
      try {
        const n = await pollInboxes(processFile);
        if (n) await sendPendingAcks();
      } catch (e) {
        metrics.ftpErrors.inc({ operation: 'connect' });
        throw e;
      }
    });
    loop('ack-sender', 10_000, sendPendingAcks);
  } else {
    log.warn('[ftp] FTP_ENABLED=false — inbound polling disabled');
  }
  loop('delivery', config.delivery.pollMs, deliverPending);
  // failed interchanges → EDI backlog (action items)
  loop('action-items', 10_000, () => syncActionItems());
  // simulation: producers answering report e-mails (they reach us through email.received webhooks)
  resend.setWorld(producerWorld);
  log.info(`[workers] FTP poll every ${config.ftp.pollIntervalMs}ms on ${config.ftp.host}:${config.ftp.port}, delivery to ${config.orderApi.url}`);
}
