import net from 'net';
import os from 'os';
import { decodeUnverifiedToken } from '../../../models/jwt';
import { writeMsg } from '../../../utils/msg/process';
import { createTypedMessage } from '../../../utils/msg/process';
import { GatewayLogin, GatewayWorkConn } from '../../../models/models';
import { YamuxSession, createServerSession } from '../../../utils/yamux/yamux';
import { Version } from '../../../info/info';

export async function loginServer(tokenStr: string): Promise<YamuxSession> {
  const token = decodeUnverifiedToken(tokenStr);
  const conn = await new Promise<net.Socket>((resolve, reject) => {
    const sock = net.createConnection(
      { host: token.Host, port: token.TcpPort, timeout: 2000 },
      () => resolve(sock),
    );
    sock.on('error', reject);
    sock.setTimeout(2000, () => {
      sock.destroy(new Error('connection timeout'));
    });
  });

  conn.setTimeout(0);

  const loginMsg = createTypedMessage<GatewayLogin>('GatewayLogin', {
    Token: tokenStr,
    Os: os.platform(),
    Arch: os.arch(),
    Version,
  });

  try {
    await writeMsg(conn, loginMsg);
  } catch (err) {
    conn.destroy();
    throw err;
  }

  const session = createServerSession(conn);
  console.log('login OK!');
  return session;
}

export async function loginWorkConn(tokenStr: string): Promise<net.Socket> {
  const token = decodeUnverifiedToken(tokenStr);
  const conn = await new Promise<net.Socket>((resolve, reject) => {
    const sock = net.createConnection(
      { host: token.Host, port: token.TcpPort },
      () => resolve(sock),
    );
    sock.on('error', reject);
  });

  const loginWorkConnMsg = createTypedMessage<GatewayWorkConn>('GatewayWorkConn', {
    RunId: token.RunId,
    Secret: tokenStr,
    Version,
  });

  try {
    await writeMsg(conn, loginWorkConnMsg);
  } catch (err) {
    conn.destroy();
    throw err;
  }
  return conn;
}
