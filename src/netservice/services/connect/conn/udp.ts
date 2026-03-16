import dgram from 'dgram';
import { Duplex } from 'stream';

export async function joinUDP(stream: Duplex, ip: string, port: number): Promise<void> {
  const isIPv6 = ip.includes(':');
  const client = dgram.createSocket(isIPv6 ? 'udp6' : 'udp4');
  const remoteAddr = { port, address: ip };

  stream.on('data', (data: Buffer) => {
    client.send(data, remoteAddr.port, remoteAddr.address, (err) => {
      if (err) console.error(`UDP 发送失败: ${err}`);
    });
  });

  client.on('message', (msg: Buffer) => {
    if (!stream.destroyed) {
      stream.write(msg);
    }
  });

  const cleanup = () => {
    try { client.close(); } catch {}
    try { stream.destroy(); } catch {}
  };

  stream.on('end', cleanup);
  stream.on('error', (err) => {
    console.error(`UDP stream 错误: ${err}`);
    cleanup();
  });
  stream.on('close', cleanup);
  client.on('error', (err) => {
    console.error(`UDP client 错误: ${err}`);
    cleanup();
  });
  client.on('close', cleanup);
}
