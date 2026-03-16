import { Duplex } from 'stream';
import * as dgram from 'dgram';
import {
  UDPSession,
  Listener,
  ListenWithOptions,
  ServeConn,
  Kcp,
  IKCP_OVERHEAD,
} from 'kcpjs';

/* eslint-disable @typescript-eslint/no-var-requires */
const { FecDecoder } = require('kcpjs/dist/fecDecoder');
const { FecEncoder } = require('kcpjs/dist/fecEncoder');
const { fecHeaderSizePlus2, mtuLimit } = require('kcpjs/dist/common');
/* eslint-enable @typescript-eslint/no-var-requires */

const KCP_DATA_SHARDS = 10;
const KCP_PARITY_SHARDS = 3;

/**
 * 将 kcpjs 的 UDPSession 包装为 Node.js Duplex 流，
 * 使其可以直接作为 yamux session 的底层传输。
 */
export class KcpDuplex extends Duplex {
  private session: UDPSession;
  private _kcpClosed = false;

  constructor(session: UDPSession) {
    super();
    this.session = session;

    session.on('recv', (data: Buffer) => {
      if (!this._kcpClosed) {
        this.push(data);
      }
    });
  }

  _read(): void {
    // 数据通过 'recv' 事件 push，无需主动拉取
  }

  _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    if (this._kcpClosed) {
      callback(new Error('KCP session is closed'));
      return;
    }
    try {
      this.session.write(chunk);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    if (!this._kcpClosed) {
      this._kcpClosed = true;
      try { this.session.close(); } catch {}
    }
    callback(error);
  }

  _final(callback: (error?: Error | null) => void): void {
    callback();
  }
}

/**
 * 对 KCP 连接应用与 Go 版 SetYamuxConn 相同的参数配置。
 */
export function configureKcpSession(session: UDPSession): void {
  session.setStreamMode(true);
  session.setWriteDelay(false);
  session.setNoDelay(0, 100, 1, 1);
  session.setWindowSize(128, 256);
  session.setMtu(1350);
  session.setACKNoDelay(true);
}

/**
 * 在指定端口创建 KCP 监听器（Server 端使用）。
 * 等待一个 KCP 连接，超时后抛出错误。
 */
export function acceptOneKcpConnection(
  localPort: number,
  timeoutMs: number = 5000,
): Promise<{ session: UDPSession; listener: Listener }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        listener.close();
        reject(new Error('KCP accept timeout'));
      }
    }, timeoutMs);

    const listener = ListenWithOptions({
      port: localPort,
      dataShards: KCP_DATA_SHARDS,
      parityShards: KCP_PARITY_SHARDS,
      callback: (session: UDPSession) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ session, listener });
        } else {
          session.close();
        }
      },
    });
  });
}

/**
 * 使用已有的 dgram socket 创建 KCP 客户端会话（Client 端使用）。
 * 这样可以复用打洞时绑定的本地端口，保持 NAT 映射。
 */
export function createKcpDialSession(
  socket: dgram.Socket,
  remoteHost: string,
  remotePort: number,
): UDPSession {
  const conv = (Math.random() * 0xFFFFFFFF) >>> 0;

  const sess = new UDPSession();
  sess.port = remotePort;
  sess.host = remoteHost;
  sess.conn = socket;
  sess.ownConn = false;
  (sess as any).recvbuf = Buffer.alloc(mtuLimit);

  sess.fecDecoder = new FecDecoder(KCP_DATA_SHARDS, KCP_PARITY_SHARDS);
  sess.fecEncoder = new FecEncoder(KCP_DATA_SHARDS, KCP_PARITY_SHARDS, 0);

  sess.headerSize = 0;
  if (sess.fecEncoder) {
    sess.headerSize += fecHeaderSizePlus2;
  }

  sess.kcp = new Kcp(conv, sess);
  sess.kcp.setReserveBytes(sess.headerSize);
  sess.kcp.setOutput((buff: Buffer, len: number) => {
    if (len >= IKCP_OVERHEAD + sess.headerSize) {
      sess.output(buff.slice(0, len));
    }
  });

  sess.readLoop();
  sess.check();

  return sess;
}
