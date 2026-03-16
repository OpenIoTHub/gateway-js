import WebSocket from 'ws';
import { Duplex } from 'stream';

export async function joinWs(
  stream: Duplex,
  url: string,
  protocol: string,
  origin: string,
): Promise<void> {
  const ws = new WebSocket(url, protocol || undefined, {
    origin: origin || undefined,
  });

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.on('message', (data: WebSocket.RawData) => {
    if (stream.destroyed) return;
    if (data instanceof Buffer) {
      stream.write(data);
    } else if (data instanceof ArrayBuffer) {
      stream.write(Buffer.from(data));
    } else if (Array.isArray(data)) {
      stream.write(Buffer.concat(data));
    }
  });

  stream.on('data', (data: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data, (err) => {
        if (err) console.error(`WebSocket 发送失败: ${err}`);
      });
    }
  });

  const cleanup = () => {
    try { ws.close(); } catch {}
    try { stream.destroy(); } catch {}
  };

  ws.on('close', cleanup);
  ws.on('error', (err) => {
    console.error(`WebSocket 错误: ${err}`);
    cleanup();
  });
  stream.on('end', cleanup);
  stream.on('error', (err) => {
    console.error(`WebSocket stream 错误: ${err}`);
    cleanup();
  });
  stream.on('close', cleanup);
}

export async function joinWss(
  stream: Duplex,
  url: string,
  protocol: string,
  origin: string,
): Promise<void> {
  return joinWs(stream, url, protocol, origin);
}
