import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'distributor_' });

export const metrics = {
  filesReceived: new client.Counter({ name: 'edi_files_received_total', help: 'Files downloaded from FTP', labelNames: ['partner'], registers: [registry] }),
  ftpErrors: new client.Counter({ name: 'edi_ftp_errors_total', help: 'FTP connection/transfer errors', labelNames: ['operation'], registers: [registry] }),
  interchanges: new client.Counter({ name: 'edi_interchanges_total', help: 'Interchanges processed by final status', labelNames: ['partner', 'status'], registers: [registry] }),
  transactions: new client.Counter({ name: 'edi_transactions_total', help: 'Transaction sets processed', labelNames: ['type', 'status'], registers: [registry] }),
  validationErrors: new client.Counter({ name: 'edi_validation_errors_total', help: 'Validation issues by code', labelNames: ['level', 'code'], registers: [registry] }),
  processingDuration: new client.Histogram({ name: 'edi_processing_duration_seconds', help: 'Time to process one interchange', buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [registry] }),
  deliveryAttempts: new client.Counter({ name: 'edi_delivery_attempts_total', help: 'REST deliveries to the order app', labelNames: ['result'], registers: [registry] }),
  acksSent: new client.Counter({ name: 'edi_acks_sent_total', help: 'TA1/997 acknowledgments uploaded', labelNames: ['type', 'code'], registers: [registry] }),
  mqPublished: new client.Counter({ name: 'mq_messages_published_total', help: 'Messages published to RabbitMQ', labelNames: ['routing_key'], registers: [registry] }),
  mqConsumed: new client.Counter({ name: 'mq_messages_consumed_total', help: 'Messages consumed from RabbitMQ', labelNames: ['queue'], registers: [registry] }),
};
