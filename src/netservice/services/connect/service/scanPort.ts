import net from 'net';
import { Duplex } from 'stream';
import { NewService, JsonResponse, ScanPort } from '../../../../models/models';
import { writeMsg, createTypedMessage } from '../../../../utils/msg/process';

export async function scanPort(stream: Duplex, service: NewService): Promise<void> {
  try {
    let config: ScanPort;
    try {
      config = JSON.parse(service.Config);
    } catch (err) {
      throw new Error(`解析端口扫描配置失败: ${err}`);
    }

    const openPorts: number[] = [];
    const CONCURRENCY = 100;
    const allPorts: number[] = [];
    for (let port = config.StartPort; port <= config.EndPort; port++) {
      allPorts.push(port);
    }

    // Scan in batches to avoid opening too many sockets
    for (let i = 0; i < allPorts.length; i += CONCURRENCY) {
      const batch = allPorts.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(
          (port) =>
            new Promise<number>((resolve) => {
              const sock = new net.Socket();
              sock.setTimeout(500);
              sock.on('connect', () => {
                sock.destroy();
                resolve(port);
              });
              sock.on('error', () => {
                sock.destroy();
                resolve(0);
              });
              sock.on('timeout', () => {
                sock.destroy();
                resolve(0);
              });
              sock.connect(port, config.Host);
            }),
        ),
      );
      for (const port of results) {
        if (port !== 0) openPorts.push(port);
      }
    }

    openPorts.sort((a, b) => a - b);

    const response = createTypedMessage<JsonResponse>('JsonResponse', {
      Code: 0,
      Msg: 'Success',
      Result: JSON.stringify(openPorts),
    });
    await writeMsg(stream, response);
  } catch (err) {
    console.error(`端口扫描失败: ${err}`);
    throw err;
  }
}
