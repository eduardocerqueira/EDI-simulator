import http from 'node:http';
import { config } from './config.js';

/**
 * Minimal Docker Engine API client over the Unix socket (no dependencies).
 * https://docs.docker.com/reference/api/engine/
 */
async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<T>((resolve, reject) => {
    const req = http.request(
      {
        socketPath: config.dockerSocket,
        path,
        method,
        headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {},
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) >= 400) {
            let msg = text;
            try { msg = JSON.parse(text).message ?? text; } catch { /* plain text */ }
            reject(Object.assign(new Error(`docker ${method} ${path}: ${res.statusCode} ${msg}`), { statusCode: res.statusCode }));
            return;
          }
          const isJson = String(res.headers['content-type'] ?? '').includes('json');
          try {
            resolve((text && isJson ? JSON.parse(text) : text || undefined) as T);
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`docker ${method} ${path}: timeout`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export interface ContainerSummary {
  Id: string;
  Names: string[];
  Image: string;
  State: string; // created | running | paused | restarting | exited | dead
  Status: string;
  Labels: Record<string, string>;
  Created: number;
}

export interface ContainerInspect {
  Id: string;
  Name: string;
  Created: string;
  State: { Status: string; Running: boolean; Paused: boolean; StartedAt: string; ExitCode: number };
  Config: {
    Hostname: string;
    Image: string;
    Env: string[];
    Labels: Record<string, string>;
    Cmd: string[] | null;
    Entrypoint: string[] | null;
    ExposedPorts?: Record<string, object>;
    Healthcheck?: object;
    WorkingDir?: string;
  };
  HostConfig: Record<string, unknown> & { Mounts?: unknown[]; Binds?: string[]; NetworkMode?: string };
  NetworkSettings: { Networks: Record<string, { IPAddress: string; Aliases: string[] | null; DNSNames?: string[] | null }> };
}

const q = (o: Record<string, unknown>) => encodeURIComponent(JSON.stringify(o));

export const docker = {
  list: (labels: string[]) => call<ContainerSummary[]>('GET', `/containers/json?all=1&filters=${q({ label: labels })}`),
  inspect: (id: string) => call<ContainerInspect>('GET', `/containers/${id}/json`),
  create: (name: string, body: unknown) => call<{ Id: string }>('POST', `/containers/create?name=${encodeURIComponent(name)}`, body),
  start: (id: string) => call<void>('POST', `/containers/${id}/start`),
  pause: (id: string) => call<void>('POST', `/containers/${id}/pause`),
  unpause: (id: string) => call<void>('POST', `/containers/${id}/unpause`),
  kill: (id: string) => call<void>('POST', `/containers/${id}/kill`),
  remove: (id: string) => call<void>('DELETE', `/containers/${id}?force=1&v=0`),
  ping: () => call<string>('GET', '/_ping'),
};
