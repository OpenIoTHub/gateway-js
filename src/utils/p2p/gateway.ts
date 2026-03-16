import { Duplex } from 'stream';
import { Listener, UDPSession } from 'kcpjs';
import * as dgram from 'dgram';
import {
  ReqNewP2PCtrlAsServer,
  ReqNewP2PCtrlAsClient,
  TokenClaims,
  UDPAddr,
  Ping,
  Pong,
} from '../../models/models';
import { writeMsg, createTypedMessage, readMsgWithTimeout } from '../msg/process';
import { YamuxSession, createServerSession } from '../yamux/yamux';
import { getP2PListener, sendHolePunchByServer } from './udpUtils';
import {
  KcpDuplex,
  configureKcpSession,
  acceptOneKcpConnection,
  createKcpDialSession,
} from './kcpDuplex';

export interface P2PServerResult {
  session: YamuxSession;
  kcpListener: Listener;
  kcpDuplex: KcpDuplex;
}

export interface P2PClientResult {
  session: YamuxSession;
  udpSocket: dgram.Socket;
  kcpSession: UDPSession;
  kcpDuplex: KcpDuplex;
}

/**
 * 作为 Server（listener）方式从 UDP 打洞中获取 KCP 连接，建立 yamux 会话。
 *
 * 流程：
 * 1. 创建 UDP socket，获取外网地址
 * 2. 向对端发送打洞包
 * 3. 将自身外网地址写回 stream
 * 4. 关闭 stream 和 UDP socket
 * 5. 在同一本地端口上启动 KCP listener，接受一个连接
 * 6. Ping/Pong 握手
 * 7. 建立 yamux server session
 */
export async function makeP2PSessionAsServer(
  stream: Duplex,
  ctrlMsg: ReqNewP2PCtrlAsServer,
  token: TokenClaims,
): Promise<P2PServerResult> {
  const { externalAddr, socket, localPort } = await getP2PListener(token);

  try {
    await sendHolePunchByServer(socket, ctrlMsg);

    const udpAddrMsg = createTypedMessage<UDPAddr>('UDPAddr', {
      IP: externalAddr.ip,
      Port: externalAddr.port,
      Zone: '',
    });
    await writeMsg(stream, udpAddrMsg);
  } finally {
    stream.destroy();
    socket.close();
  }

  await sleep(1000);

  console.log(`P2P Server: 在端口 ${localPort} 启动 KCP 监听`);
  const { session: kcpUdpSession, listener: kcpListener } =
    await acceptOneKcpConnection(localPort, 5000);

  configureKcpSession(kcpUdpSession);
  console.log(`P2P Server: 已接受 KCP 连接, remote=${kcpUdpSession.host}:${kcpUdpSession.port}`);

  const kcpDuplex = new KcpDuplex(kcpUdpSession);
  const yamuxSession = await kcpHandshakeAndCreateSession(kcpDuplex);

  return { session: yamuxSession, kcpListener, kcpDuplex };
}

/**
 * 作为 Client（dial）方式创建 KCP 连接，建立 yamux 会话。
 *
 * 流程：
 * 1. 创建 UDP socket，获取外网地址
 * 2. 将自身外网地址写回 stream
 * 3. 等待 stream 返回 OK
 * 4. 使用同一 UDP socket 创建 KCP 连接到对端
 * 5. Ping/Pong 握手
 * 6. 建立 yamux server session
 */
export async function makeP2PSessionAsClient(
  stream: Duplex,
  ctrlMsg: ReqNewP2PCtrlAsClient,
  token: TokenClaims,
): Promise<P2PClientResult> {
  const { externalAddr, socket } = await getP2PListener(token);

  try {
    const udpAddrMsg = createTypedMessage<UDPAddr>('UDPAddr', {
      IP: externalAddr.ip,
      Port: externalAddr.port,
      Zone: '',
    });
    await writeMsg(stream, udpAddrMsg);

    const { type } = await readMsgWithTimeout(stream, 5000);
    if (type !== 'models.OK') {
      throw new Error(`P2P Client: expected OK, got ${type}`);
    }
    console.log('P2P Client: 收到 OK，开始建立 KCP 连接');
  } catch (err) {
    socket.close();
    stream.destroy();
    throw err;
  }
  stream.destroy();

  const kcpSession = createKcpDialSession(
    socket,
    ctrlMsg.ExternalIp,
    ctrlMsg.ExternalPort,
  );
  configureKcpSession(kcpSession);

  await sleep(1000);

  const kcpDuplex = new KcpDuplex(kcpSession);

  const pingMsg = createTypedMessage<Ping>('Ping', {});
  await writeMsg(kcpDuplex, pingMsg);
  console.log('P2P Client: 已发送 Ping');

  const { type: pongType } = await readMsgWithTimeout(kcpDuplex, 5000);
  if (pongType !== 'models.Pong') {
    kcpDuplex.destroy();
    socket.close();
    throw new Error(`P2P Client: expected Pong, got ${pongType}`);
  }
  console.log('P2P Client: 收到 Pong，KCP 握手成功');

  const yamuxSession = createServerSession(kcpDuplex);

  return { session: yamuxSession, udpSocket: socket, kcpSession, kcpDuplex };
}

/**
 * KCP 连接上的 Ping/Pong 握手（Server 端）。
 * 读取 Ping，回复 Pong，然后建立 yamux server session。
 */
async function kcpHandshakeAndCreateSession(kcpDuplex: KcpDuplex): Promise<YamuxSession> {
  const { type } = await readMsgWithTimeout(kcpDuplex, 5000);
  if (type !== 'models.Ping') {
    kcpDuplex.destroy();
    throw new Error(`P2P Server: expected Ping, got ${type}`);
  }
  console.log('P2P Server: 收到 Ping');

  const pongMsg = createTypedMessage<Pong>('Pong', {});
  await writeMsg(kcpDuplex, pongMsg);
  console.log('P2P Server: 已回复 Pong，KCP 握手成功');

  return createServerSession(kcpDuplex);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
