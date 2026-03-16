import net from 'net';
import tls from 'tls';
import dgram from 'dgram';

export async function checkTcpUdpTlsAsync(
  connType: string,
  addr: string,
): Promise<{ code: number; message: string }> {
  try {
    const { host, port } = parseAddr(addr);
    switch (connType) {
      case 'tcp': {
        await new Promise<void>((resolve, reject) => {
          const sock = net.createConnection({ host, port, timeout: 1000 }, () => {
            sock.destroy();
            resolve();
          });
          sock.on('error', reject);
          sock.setTimeout(1000, () => {
            sock.destroy();
            reject(new Error('timeout'));
          });
        });
        return { code: 0, message: '' };
      }
      case 'udp': {
        await new Promise<void>((resolve, reject) => {
          const isIPv6 = host.includes(':');
          const client = dgram.createSocket(isIPv6 ? 'udp6' : 'udp4');
          const timer = setTimeout(() => {
            client.close();
            // UDP is connectionless; if we can send without error, consider reachable
            resolve();
          }, 1000);
          client.send(Buffer.alloc(0), port, host, (err) => {
            if (err) {
              clearTimeout(timer);
              client.close();
              reject(err);
            }
          });
          client.on('error', (err) => {
            clearTimeout(timer);
            client.close();
            reject(err);
          });
          client.on('message', () => {
            clearTimeout(timer);
            client.close();
            resolve();
          });
        });
        return { code: 0, message: '' };
      }
      case 'tls': {
        await new Promise<void>((resolve, reject) => {
          const sock = tls.connect({ host, port }, () => {
            sock.destroy();
            resolve();
          });
          sock.on('error', reject);
        });
        return { code: 0, message: '' };
      }
      default:
        return { code: 1, message: 'type not tcp,udp or tls' };
    }
  } catch (err: any) {
    return { code: 1, message: err.message || String(err) };
  }
}

function parseAddr(addr: string): { host: string; port: number } {
  // Handle [ipv6]:port
  if (addr.startsWith('[')) {
    const closeBracket = addr.indexOf(']');
    if (closeBracket === -1) return { host: addr, port: 80 };
    const host = addr.substring(1, closeBracket);
    const rest = addr.substring(closeBracket + 1);
    if (rest.startsWith(':')) {
      return { host, port: parseInt(rest.substring(1), 10) };
    }
    return { host, port: 80 };
  }
  const lastColon = addr.lastIndexOf(':');
  if (lastColon === -1) return { host: addr, port: 80 };
  return {
    host: addr.substring(0, lastColon),
    port: parseInt(addr.substring(lastColon + 1), 10),
  };
}
