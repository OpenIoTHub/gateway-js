import * as dgram from 'dgram';
import { TokenClaims, ReqNewP2PCtrlAsServer, ReqNewP2PCtrlAsClient } from '../../models/models';

export interface ExternalAddr {
  ip: string;
  port: number;
}

export interface P2PListenerResult {
  externalAddr: ExternalAddr;
  socket: dgram.Socket;
  localPort: number;
}

/**
 * 通过 UDP API 服务器获取本机的外网 IP 和端口。
 * 向 token.Host:token.UDPApiPort 发送 "getIpPort"，服务器回写 "ip:port"。
 */
export function getExternalIpPortByUDP(
  socket: dgram.Socket,
  token: TokenClaims,
): Promise<ExternalAddr> {
  return new Promise((resolve, reject) => {
    const host = token.Host;
    const port = token.UDPApiPort;
    const timeoutMs = 3000;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('getExternalIpPortByUDP timeout'));
    }, timeoutMs);

    const onMessage = (msg: Buffer) => {
      cleanup();
      const ipPort = msg.toString('utf8');
      const parts = ipPort.split(':');
      if (parts.length < 2) {
        reject(new Error(`invalid response: ${ipPort}`));
        return;
      }
      const ip = parts[0];
      const p = parseInt(parts[1], 10);
      if (isNaN(p)) {
        reject(new Error(`invalid port in response: ${ipPort}`));
        return;
      }
      resolve({ ip, port: p });
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    function cleanup() {
      clearTimeout(timer);
      socket.removeListener('message', onMessage);
      socket.removeListener('error', onError);
    }

    socket.on('message', onMessage);
    socket.on('error', onError);
    socket.send(Buffer.from('getIpPort'), port, host);
  });
}

/**
 * 创建 UDP 监听器并获取外网地址，用于 P2P 打洞。
 */
export async function getP2PListener(token: TokenClaims): Promise<P2PListenerResult> {
  const socket = dgram.createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject);
    socket.bind(0, () => {
      socket.removeListener('error', reject);
      resolve();
    });
  });

  const addr = socket.address() as { address: string; family: string; port: number };
  const localPort = addr.port;

  try {
    const externalAddr = await getExternalIpPortByUDP(socket, token);
    console.log(`P2P 本地端口: ${localPort}, 外网地址: ${externalAddr.ip}:${externalAddr.port}`);
    return { externalAddr, socket, localPort };
  } catch (err) {
    socket.close();
    throw err;
  }
}

/**
 * 向对端发送打洞数据包（5次 "packFromPeer"），用于 NAT 穿透。
 */
export async function sendHolePunchPackets(
  socket: dgram.Socket,
  remoteIp: string,
  remotePort: number,
): Promise<void> {
  console.log(`发送打洞包到: ${remoteIp}:${remotePort}`);
  const pkt = Buffer.from('packFromPeer');
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve, reject) => {
      socket.send(pkt, remotePort, remoteIp, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await sleep(10);
  }
  await sleep(200);
}

export function sendHolePunchByServer(
  socket: dgram.Socket,
  msg: ReqNewP2PCtrlAsServer,
): Promise<void> {
  return sendHolePunchPackets(socket, msg.ExternalIp, msg.ExternalPort);
}

export function sendHolePunchByClient(
  socket: dgram.Socket,
  msg: ReqNewP2PCtrlAsClient,
): Promise<void> {
  return sendHolePunchPackets(socket, msg.ExternalIp, msg.ExternalPort);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
