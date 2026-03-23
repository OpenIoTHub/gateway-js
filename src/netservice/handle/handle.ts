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
  ReqNewP2PCtrlAsServer,
  ReqNewP2PCtrlAsClient,
} from '../../models/models';
import {
  makeP2PSessionAsServer,
  makeP2PSessionAsClient,
} from '../../utils/p2p/gateway';

export async function handleStream(stream: Duplex, tokenStr: string): Promise<void> {
  try {
    if (!tokenStr) {
      console.error('handleStream: 缺少网关 token（不得为空字符串）');
      try {
        stream.destroy();
      } catch {}
      return;
    }
    let tokenModel: TokenClaims | null = null;
    try {
      tokenModel = decodeUnverifiedToken(tokenStr);
    } catch (err) {
      console.error(`解析token失败: ${err}`);
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
        await serviceHdl(stream, m, tokenStr);
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
          console.log('tokenModel为空，无法创建P2P会话1');
          stream.destroy();
          return;
        }
        const serverMsg = msg as ReqNewP2PCtrlAsServer;
        (async () => {
          try {
            const { session: p2pSession, kcpListener, kcpDuplex } =
              await makeP2PSessionAsServer(stream, serverMsg, tokenModel);
            try {
              await handleSession(p2pSession, tokenStr);
            } finally {
              kcpDuplex.destroy();
              kcpListener.close();
            }
          } catch (err) {
            console.error(`创建P2P服务器会话失败: ${err}`);
          }
        })();
        break;
      }
      case 'models.ReqNewP2PCtrlAsClient': {
        console.log('作为dial方式从洞中创建kcp连接');
        if (!tokenModel) {
          console.log('tokenModel为空，无法创建P2P会话2');
          stream.destroy();
          return;
        }
        const clientMsg = msg as ReqNewP2PCtrlAsClient;
        (async () => {
          try {
            const { session: p2pSession, udpSocket, kcpDuplex } =
              await makeP2PSessionAsClient(stream, clientMsg, tokenModel);
            try {
              await handleSession(p2pSession, tokenStr);
            } finally {
              kcpDuplex.destroy();
              udpSocket.close();
            }
          } catch (err) {
            console.error(`创建P2P客户端会话失败: ${err}`);
          }
        })();
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
  if (!tokenStr) {
    console.error('handleSession: 缺少网关 token（不得为空字符串）');
    try {
      await session.close();
    } catch {}
    return;
  }
  try {
    while (true) {
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
