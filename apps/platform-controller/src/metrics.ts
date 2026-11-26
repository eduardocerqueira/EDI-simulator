import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'platform_controller_' });

export const metrics = {
  desiredNodes: new client.Gauge({ name: 'ftp_cluster_desired_nodes', help: 'Desired number of FTP nodes', registers: [registry] }),
  readyNodes: new client.Gauge({ name: 'ftp_cluster_ready_nodes', help: 'FTP nodes answering the FTP greeting', registers: [registry] }),
  nodeUp: new client.Gauge({ name: 'ftp_node_up', help: '1 if the FTP node answers its greeting probe', labelNames: ['slot', 'node'], registers: [registry] }),
  nodeGeneration: new client.Gauge({ name: 'ftp_node_generation', help: 'How many containers have served this slot', labelNames: ['slot', 'node'], registers: [registry] }),
  probeDuration: new client.Gauge({ name: 'ftp_node_probe_duration_seconds', help: 'Duration of the last FTP greeting probe', labelNames: ['slot'], registers: [registry] }),
  replacements: new client.Counter({ name: 'ftp_node_replacements_total', help: 'Nodes replaced by the platform controller', labelNames: ['slot'], registers: [registry] }),
  recoverySeconds: new client.Gauge({ name: 'ftp_node_last_recovery_seconds', help: 'Seconds from failure to the replacement node answering', labelNames: ['slot'], registers: [registry] }),
  storageFiles: new client.Gauge({ name: 'ftp_storage_files', help: 'Files on the shared FTP volume', labelNames: ['partner', 'folder'], registers: [registry] }),
  storageBytes: new client.Gauge({ name: 'ftp_storage_bytes', help: 'Bytes on the shared FTP volume', labelNames: ['partner', 'folder'], registers: [registry] }),
  volumeSize: new client.Gauge({ name: 'ftp_volume_size_bytes', help: 'Shared volume filesystem size', registers: [registry] }),
  volumeFree: new client.Gauge({ name: 'ftp_volume_free_bytes', help: 'Shared volume free space', registers: [registry] }),
};
