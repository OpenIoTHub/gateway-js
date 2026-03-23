import * as dgram from 'dgram';
import * as net from 'net';
import type { AddressInfo } from 'net';
import dns from 'dns/promises';
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

/** 去掉 host 上可能带的 [ipv6] 括号，供 dns.lookup 使用 */
function normalizeHostForLookup(host: string): string {
  const t = host.trim();
  if (t.startsWith('[')) {
    const end = t.indexOf(']');
    if (end > 0) {
      return t.slice(1, end);
    }
  }
  return t;
}

/**
 * 解析 UDP API 回包，与 Go `remoteAddr.String()` 格式一致：
 * IPv4 `a.b.c.d:port`；IPv6 `[addr]:port`
 */
function parseServerIpPortResponse(raw: string): ExternalAddr {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end === -1) {
      throw new Error(`invalid response: ${trimmed}`);
    }
    const ip = trimmed.slice(1, end);
    const after = trimmed.slice(end + 1);
    if (!after.startsWith(':')) {
      throw new Error(`invalid response: ${trimmed}`);
    }
    const port = parseInt(after.slice(1), 10);
    if (Number.isNaN(port)) {
      throw new Error(`invalid port in response: ${trimmed}`);
    }
    return { ip, port };
  }
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon <= 0) {
    throw new Error(`invalid response: ${trimmed}`);
  }
  const ip = trimmed.slice(0, lastColon);
  const port = parseInt(trimmed.slice(lastColon + 1), 10);
  if (Number.isNaN(port)) {
    throw new Error(`invalid port in response: ${trimmed}`);
  }
  return { ip, port };
}

/**
 * 解析 UDP API 服务端地址。P2P 后续会用**同一** dgram socket 向对端 IPv4 打洞/KCP，
 * 因此双栈域名时优先选 IPv4（udp4），与旧版 gateway-js 及常见对端 ExternalIp 一致。
 */
async function resolveUdpApiServer(
  hostForLookup: string,
): Promise<{ address: string; family: 4 | 6 }> {
  if (net.isIPv4(hostForLookup)) {
    return { address: hostForLookup, family: 4 };
  }
  if (net.isIPv6(hostForLookup)) {
    return { address: hostForLookup, family: 6 };
  }
  try {
    const r = await dns.lookup(hostForLookup, { family: 4 });
    return { address: r.address, family: 4 };
  } catch {
    const r = await dns.lookup(hostForLookup, { family: 6 });
    return { address: r.address, family: 6 };
  }
}

/**
 * 通过 UDP API 服务器获取本机的外网 IP 和端口（与 utils/net/udp_api.go GetExternalIpPortByUDP 对齐）。
 * 先解析 DNS、按 v4/v6 建 socket；超时从「send 成功交给内核之后」再计时，避免 DNS 耗时吃掉 3s。
 */
export function getExternalIpPortByUDP(
  socket: dgram.Socket,
  token: TokenClaims,
  resolvedServerIp: string,
): Promise<ExternalAddr> {
  const port = token.UDPApiPort;
  return new Promise((resolve, reject) => {
    const timeoutMs = 3000;

    const onMessage = (msg: Buffer) => {
      cleanup();
      try {
        resolve(parseServerIpPortResponse(msg.toString('utf8')));
      } catch (e) {
        reject(e);
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;

    function cleanup() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      socket.off('message', onMessage);
      socket.off('error', onError);
    }

    socket.on('message', onMessage);
    socket.on('error', onError);

    socket.send(Buffer.from('getIpPort'), port, resolvedServerIp, (sendErr) => {
      if (sendErr) {
        cleanup();
        reject(sendErr);
        return;
      }
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('getExternalIpPortByUDP timeout'));
      }, timeoutMs);
    });
  });
}

/**
 * 创建 UDP 监听器并获取外网地址，用于 P2P 打洞（与 utils/net/p2p/p2p.go GetP2PListener 对齐：ListenUDP + GetExternalIpPortByUDP）。
 */
export async function getP2PListener(token: TokenClaims): Promise<P2PListenerResult> {
  const hostRaw = token.Host?.trim() ?? '';
  const udpApiPort = token.UDPApiPort;
  if (!hostRaw) {
    throw new Error('token.Host 为空，无法请求 UDP API');
  }
  if (!udpApiPort) {
    throw new Error('token.UDPApiPort 无效，无法请求 UDP API');
  }

  const hostForLookup = normalizeHostForLookup(hostRaw);
  const lookup = await resolveUdpApiServer(hostForLookup);

  const socketType = lookup.family === 6 ? 'udp6' : 'udp4';
  const socket = dgram.createSocket(socketType);

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, () => {
      socket.removeListener('error', reject);
      resolve();
    });
  });

  const addr = socket.address() as AddressInfo;
  const localPort = addr.port;

  try {
    const externalAddr = await getExternalIpPortByUDP(socket, token, lookup.address);
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
