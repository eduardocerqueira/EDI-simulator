import net from 'node:net';

export interface ProbeResult {
  ok: boolean;
  ms: number;
  banner?: string;
  error?: string;
}

/**
 * FTP health probe: open a TCP connection to port 21 and wait for the "220"
 * greeting. A frozen (paused/hung) node still accepts the TCP connection in
 * the kernel but never greets, so a plain port check would miss it.
 */
export function probeFtp(host: string, port = 21, timeoutMs = 1500): Promise<ProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (r: Omit<ProbeResult, 'ms'>) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ...r, ms: Date.now() - started });
    };
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs, () => finish({ ok: false, error: `no FTP greeting within ${timeoutMs}ms` }));
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (data.includes('\n')) {
        const line = data.split('\n')[0]!.trim();
        if (line.startsWith('220')) {
          socket.write('QUIT\r\n');
          finish({ ok: true, banner: line });
        } else finish({ ok: false, error: `unexpected greeting: ${line}` });
      }
    });
    socket.on('error', (e) => finish({ ok: false, error: e.message }));
    socket.on('close', () => finish({ ok: false, error: 'connection closed before greeting' }));
  });
}
