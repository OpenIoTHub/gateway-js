import dgram from 'dgram';
import { Duplex } from 'stream';
import { NewService } from '../../../../models/models';

function splitHostPort(addr: string): { host: string; port: number } {
  // Handle [ipv6]:port format
  if (addr.startsWith('[')) {
    const closeBracket = addr.indexOf(']');
    if (closeBracket === -1) throw new Error(`invalid address: ${addr}`);
    const host = addr.substring(1, closeBracket);
    const portStr = addr.substring(closeBracket + 1);
    if (portStr.startsWith(':')) {
      return { host, port: parseInt(portStr.substring(1), 10) };
    }
    return { host, port: 0 };
  }
  // Handle host:port (ipv4 or hostname)
  const lastColon = addr.lastIndexOf(':');
  if (lastColon === -1) throw new Error(`invalid address (no port): ${addr}`);
  return {
    host: addr.substring(0, lastColon),
    port: parseInt(addr.substring(lastColon + 1), 10),
  };
}

export async function listenMulticastUDP(stream: Duplex, service: NewService): Promise<void> {
  const { host, port } = splitHostPort(service.Config);
  if (isNaN(port) || port <= 0) {
    throw new Error(`invalid port in ListenMulticastUDP config: ${service.Config}`);
  }

  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  sock.bind(port, () => {
    try {
      sock.addMembership(host);
    } catch (err) {
      console.error(`加入组播组失败: ${err}`);
    }
  });

  sock.on('message', (msg: Buffer) => {
    try {
      stream.write(msg);
    } catch (err) {
      console.error(`写入 stream 失败: ${err}`);
    }
  });

  stream.on('data', (data: Buffer) => {
    sock.send(data, port, host);
  });

  const cleanup = () => {
    try { sock.close(); } catch {}
    try { stream.destroy(); } catch {}
  };

  stream.on('end', cleanup);
  stream.on('error', cleanup);
  stream.on('close', cleanup);
  sock.on('error', (err) => {
    console.error(`组播 UDP 错误: ${err}`);
    cleanup();
  });
  sock.on('close', cleanup);
}
