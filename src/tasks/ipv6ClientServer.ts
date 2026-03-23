import net from 'net';
import { clientTaskChan } from '../chans/chans';
import { setIpv6ListenTcpHandlePort } from '../config/config';
import { gatewayManager } from '../services/gatewayManager';
import { handleSession } from '../netservice/handle/handle';
import { writeMsg, readMsg, createTypedMessage } from '../utils/msg/process';
import { JsonResponse } from '../models/models';
import { createServerSession } from '../utils/yamux/yamux';

export function ipv6ClientTask(): void {
  (async () => {
    while (true) {
      try {
        const remoteIpv6Server = await clientTaskChan.receive();
        console.log('====获取到任务');
        const {
          Ipv6AddrIp: ip,
          Ipv6AddrPort: port,
          LocalGatewayToken: dialToken,
        } = remoteIpv6Server;
        if (!dialToken) {
          console.error('IPv6 任务缺少 LocalGatewayToken，跳过连接');
          continue;
        }

        const conn = await new Promise<net.Socket>((resolve, reject) => {
          const sock = net.createConnection({ host: ip, port }, () => resolve(sock));
          sock.on('error', reject);
        });

        console.log(`ipv6 net.DialTCP connected: ${ip}`);

        const runIdMsg = createTypedMessage<JsonResponse>('JsonResponse', {
          Code: 0,
          Msg: '',
          Result: '',
        });
        await writeMsg(conn, runIdMsg);

        const session = createServerSession(conn);
        console.log('ipv6 p2p client HandleSession');
        handleSession(session, dialToken).catch((err) => {
          console.error(`ipv6 p2p client session error: ${err}`);
        });
      } catch (err) {
        console.error(`ipv6 client task error: ${err}`);
      }
    }
  })();
}

export function ipv6ServerTask(): void {
  const server = net.createServer((conn) => {
    console.log(`ipv6 server handle conn ${conn.remoteAddress}:${conn.remotePort}`);
    ipv6ClientHandle(conn);
  });

  server.listen(0, '::', () => {
    const addr = server.address() as net.AddressInfo;
    console.log(`ipv6 server listening on ${addr.port}`);
    setIpv6ListenTcpHandlePort(addr.port);
  });

  server.on('error', (err) => {
    console.error(`ipv6 server error: ${err}`);
  });
}

async function ipv6ClientHandle(conn: net.Socket): Promise<void> {
  try {
    const { msg: _rawMsg } = await readMsg(conn);
    // TODO: 校验首包 JsonResponse 中的 RunId 等与对端身份
    const acceptToken = gatewayManager.getAnyLoginToken();
    if (!acceptToken) {
      console.error('IPv6 入站：当前无已登录网关会话，关闭连接');
      conn.destroy();
      return;
    }
    const session = createServerSession(conn);
    console.log(`ipv6 server handle session ${conn.remoteAddress}`);
    handleSession(session, acceptToken).catch((err) => {
      console.error(`ipv6 server session error: ${err}`);
    });
  } catch (err) {
    console.error(`从stream读取数据错误: ${err}`);
    conn.destroy();
  }
}
