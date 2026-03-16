import net from 'net';
import tls from 'tls';
import { Duplex } from 'stream';
import { join } from '../../../../utils/io/join';

export async function joinTCP(stream: Duplex, ip: string, port: number): Promise<void> {
  const conn = await new Promise<net.Socket>((resolve, reject) => {
    const sock = net.createConnection({ host: ip, port, timeout: 30000 }, () => resolve(sock));
    sock.on('error', reject);
    sock.setTimeout(30000, () => {
      sock.destroy(new Error('connection timeout'));
    });
  });
  conn.setTimeout(0);
  join(stream, conn);
}

export async function joinSTCP(stream: Duplex, ip: string, port: number): Promise<void> {
  const conn = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const sock = tls.connect({ host: ip, port }, () => resolve(sock));
    sock.on('error', reject);
  });
  join(stream, conn);
}
