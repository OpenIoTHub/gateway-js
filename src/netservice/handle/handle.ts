import { Duplex } from 'stream';
import { YamuxSession, createServerSession } from '../../utils/yamux/yamux';
import { readMsg, writeMsg, createTypedMessage } from '../../utils/msg/process';
import { decodeUnverifiedToken } from '../../models/jwt';
import { loginWorkConn } from '../services/login/login';
import { joinTCP, joinSTCP } from '../services/connect/conn/tcp';
import { joinUDP } from '../services/connect/conn/udp';
import { joinWs, joinWss } from '../services/connect/conn/ws';
import { joinSSH } from '../services/connect/conn/ssh';
import { joinSerialPort } from '../services/connect/conn/serialPort';
import { serviceHdl } from '../services/connect/service/serviceHdl';
import { checkTcpUdpTlsAsync } from '../services/connect/service/check';
import {
  ConnectTCP,
  ConnectSTCP,
  ConnectUDP,
  ConnectWs,
  ConnectWss,
  ConnectSSH,
  ConnectSerialPort,
  NewService,
  Pong,
  CheckStatusRequest,
  CheckStatusResponse,
  TokenClaims,
} from '../../models/models';

export async function handleStream(stream: Duplex, tokenStr: string): Promise<void> {
  try {
    let tokenModel: TokenClaims | null = null;
    if (tokenStr) {
      try {
        tokenModel = decodeUnverifiedToken(tokenStr);
      } catch (err) {
        console.error(`解析token失败: ${err}`);
      }
    }

    const { type, msg } = await readMsg(stream);

    switch (type) {
      case 'models.ConnectTCP': {
        const m = msg as ConnectTCP;
        console.log(`处理TCP连接: ${m.TargetIP}:${m.TargetPort}`);
        await joinTCP(stream, m.TargetIP, m.TargetPort);
        break;
      }
      case 'models.ConnectSTCP': {
        const m = msg as ConnectSTCP;
        console.log(`处理STCP连接: ${m.TargetIP}:${m.TargetPort}`);
        await joinSTCP(stream, m.TargetIP, m.TargetPort);
        break;
      }
      case 'models.ConnectUDP': {
        const m = msg as ConnectUDP;
        console.log(`处理UDP连接: ${m.TargetIP}:${m.TargetPort}`);
        await joinUDP(stream, m.TargetIP, m.TargetPort);
        break;
      }
      case 'models.ConnectSerialPort': {
        const m = msg as ConnectSerialPort;
        console.log('处理串口连接');
        await joinSerialPort(stream, m);
        break;
      }
      case 'models.ConnectWs': {
        const m = msg as ConnectWs;
        console.log(`处理WebSocket连接: ${m.TargetUrl}`);
        await joinWs(stream, m.TargetUrl, m.Protocol, m.Origin);
        break;
      }
      case 'models.ConnectWss': {
        const m = msg as ConnectWss;
        console.log(`处理WebSocket Secure连接: ${m.TargetUrl}`);
        await joinWss(stream, m.TargetUrl, m.Protocol, m.Origin);
        break;
      }
      case 'models.ConnectSSH': {
        const m = msg as ConnectSSH;
        console.log(`处理SSH连接: ${m.TargetIP}:${m.TargetPort}`);
        await joinSSH(stream, m.TargetIP, m.TargetPort, m.UserName, m.PassWord);
        break;
      }
      case 'models.NewService': {
        const m = msg as NewService;
        await serviceHdl(stream, m);
        break;
      }
      case 'models.NewSubSession': {
        console.log('创建新的子会话');
        const session = createServerSession(stream);
        handleSession(session, tokenStr);
        break;
      }
      case 'models.RequestNewWorkConn': {
        console.log('服务器请求一个新的工作连接');
        stream.destroy();
        newWorkConn(tokenStr);
        break;
      }
      case 'models.Ping': {
        const pong = createTypedMessage<Pong>('Pong', {});
        await writeMsg(stream, pong);
        break;
      }
      case 'models.ReqNewP2PCtrlAsServer': {
        console.log('作为listener方式从洞中获取kcp连接');
        if (!tokenModel) {
          console.log('tokenModel为空，无法创建P2P会话');
          stream.destroy();
          return;
        }
        // P2P/KCP in Node.js is complex, log and skip
        console.log('P2P server session not yet implemented in JS version');
        stream.destroy();
        break;
      }
      case 'models.ReqNewP2PCtrlAsClient': {
        console.log('作为dial方式从洞中创建kcp连接');
        if (!tokenModel) {
          console.log('tokenModel为空，无法创建P2P会话');
          stream.destroy();
          return;
        }
        console.log('P2P client session not yet implemented in JS version');
        stream.destroy();
        break;
      }
      case 'models.CheckStatusRequest': {
        const m = msg as CheckStatusRequest;
        let response: CheckStatusResponse;
        if (['tcp', 'udp', 'tls'].includes(m.Type)) {
          const { code, message } = await checkTcpUdpTlsAsync(m.Type, m.Addr);
          response = { Code: code, Message: message };
        } else {
          response = { Code: 1, Message: 'type not support' };
        }
        const typed = createTypedMessage<CheckStatusResponse>('CheckStatusResponse', response);
        await writeMsg(stream, typed);
        stream.destroy();
        break;
      }
      case 'models.DeleteGatewayJwt': {
        // TODO: 实现删除网关JWT的逻辑
        stream.destroy();
        break;
      }
      default:
        console.log(`未知的消息类型: ${type}`);
        stream.destroy();
        break;
    }
  } catch (err) {
    console.error(`handleStream error: ${err}`);
    try { stream.destroy(); } catch {}
  }
}

export async function handleSession(session: YamuxSession, tokenStr: string): Promise<void> {
  try {
    while (!session.isClosed()) {
      const stream = await session.acceptStream();
      if (!stream) break;
      handleStream(stream, tokenStr).catch((err) => {
        console.error(`handleStream from session error: ${err}`);
      });
    }
  } catch (err) {
    console.error(`从session接受流失败: ${err}`);
  } finally {
    try { await session.close(); } catch {}
  }
}

async function newWorkConn(tokenStr: string): Promise<void> {
  if (!tokenStr) {
    console.log('token为空，无法创建工作连接');
    return;
  }
  try {
    const conn = await loginWorkConn(tokenStr);
    console.log('创建到服务端的工作连接成功');
    handleStream(conn, tokenStr).catch((err) => {
      console.error(`工作连接处理失败: ${err}`);
    });
  } catch (err) {
    console.error(`创建到服务端的工作连接失败: ${err}`);
  }
}
