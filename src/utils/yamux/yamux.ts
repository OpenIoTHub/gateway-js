import net from 'net';
import { EventEmitter } from 'events';
import { Duplex } from 'stream';

// Yamux protocol constants (wire-compatible with HashiCorp yamux / libp2p go-yamux)
const PROTO_VERSION = 0;

const enum MsgType {
  Data = 0,
  WindowUpdate = 1,
  Ping = 2,
  GoAway = 3,
}

const enum Flag {
  SYN = 1,
  ACK = 2,
  FIN = 4,
  RST = 8,
}

const enum GoAwayCode {
  Normal = 0,
  ProtoError = 1,
  InternalError = 2,
}

const HEADER_SIZE = 12;
const INITIAL_STREAM_WINDOW = 256 * 1024; // 256KB
const MAX_STREAM_WINDOW = 16 * 1024 * 1024; // 16MB

interface YamuxConfig {
  acceptBacklog: number;
  enableKeepAlive: boolean;
  keepAliveInterval: number; // ms
  maxStreamWindowSize: number;
}

const defaultConfig: YamuxConfig = {
  acceptBacklog: 256,
  enableKeepAlive: true,
  keepAliveInterval: 30000,
  maxStreamWindowSize: INITIAL_STREAM_WINDOW,
};

function encodeHeader(
  type: MsgType,
  flags: number,
  streamID: number,
  length: number,
): Buffer {
  const buf = Buffer.alloc(HEADER_SIZE);
  buf.writeUInt8(PROTO_VERSION, 0);
  buf.writeUInt8(type, 1);
  buf.writeUInt16BE(flags, 2);
  buf.writeUInt32BE(streamID, 4);
  buf.writeUInt32BE(length, 8);
  return buf;
}

interface Header {
  version: number;
  type: MsgType;
  flags: number;
  streamID: number;
  length: number;
}

function decodeHeader(buf: Buffer): Header {
  return {
    version: buf.readUInt8(0),
    type: buf.readUInt8(1) as MsgType,
    flags: buf.readUInt16BE(2),
    streamID: buf.readUInt32BE(4),
    length: buf.readUInt32BE(8),
  };
}

export class YamuxStream extends Duplex {
  private session: YamuxSession;
  public streamID: number;
  private sendWindow: number = INITIAL_STREAM_WINDOW;
  private recvWindow: number = INITIAL_STREAM_WINDOW;
  private recvBuf: Buffer[] = [];
  private recvBufLen: number = 0;
  private readWaiting: (() => void) | null = null;
  private _finSent: boolean = false;
  private _finReceived: boolean = false;
  private _rstReceived: boolean = false;
  private _closed: boolean = false;
  private sendResolvers: Array<{ size: number; resolve: () => void }> = [];

  constructor(session: YamuxSession, streamID: number) {
    super();
    this.session = session;
    this.streamID = streamID;
  }

  _read(_size: number): void {
    if (this.recvBufLen > 0) {
      const chunk = Buffer.concat(this.recvBuf);
      this.recvBuf = [];
      this.recvBufLen = 0;
      this.push(chunk);
      this.sendWindowUpdate(chunk.length);
    } else if (this._finReceived || this._rstReceived || this._closed) {
      this.push(null);
    } else {
      this.readWaiting = () => {
        if (this.recvBufLen > 0) {
          const chunk = Buffer.concat(this.recvBuf);
          this.recvBuf = [];
          this.recvBufLen = 0;
          this.push(chunk);
          this.sendWindowUpdate(chunk.length);
        } else {
          this.push(null);
        }
      };
    }
  }

  _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    if (this._closed || this._rstReceived) {
      callback(new Error('stream is closed'));
      return;
    }
    this.writeData(chunk).then(() => callback()).catch(callback);
  }

  private async writeData(data: Buffer): Promise<void> {
    let offset = 0;
    while (offset < data.length) {
      if (this._closed || this._rstReceived) {
        throw new Error('stream is closed');
      }
      const toSend = Math.min(data.length - offset, this.sendWindow);
      if (toSend <= 0) {
        await new Promise<void>((resolve) => {
          this.sendResolvers.push({ size: 1, resolve });
        });
        if (this._closed || this._rstReceived) {
          throw new Error('stream closed while waiting for send window');
        }
        continue;
      }
      const chunk = data.subarray(offset, offset + toSend);
      this.sendWindow -= toSend;
      await this.session.writeFrame(MsgType.Data, 0, this.streamID, chunk);
      offset += toSend;
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    if (!this._finSent && !this._closed) {
      this._finSent = true;
      this.session
        .writeFrame(MsgType.Data, Flag.FIN, this.streamID, Buffer.alloc(0))
        .then(() => callback())
        .catch(callback);
    } else {
      callback();
    }
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    this._closed = true;
    // Reject all pending write waiters so they don't hang forever
    for (const r of this.sendResolvers) {
      r.resolve();
    }
    this.sendResolvers = [];
    if (!this._finSent && !this._rstReceived) {
      this.session
        .writeFrame(MsgType.Data, Flag.RST, this.streamID, Buffer.alloc(0))
        .catch(() => {});
    }
    this.session.removeStream(this.streamID);
    if (this.readWaiting) {
      const cb = this.readWaiting;
      this.readWaiting = null;
      cb();
    }
    callback(error);
  }

  handleData(data: Buffer, flags: number): void {
    if (flags & Flag.RST) {
      this._rstReceived = true;
      this._closed = true;
      this.push(null);
      this.destroy();
      return;
    }
    if (data.length > 0) {
      this.recvBuf.push(data);
      this.recvBufLen += data.length;
      this.recvWindow -= data.length;
    }
    if (flags & Flag.FIN) {
      this._finReceived = true;
    }
    if (this.readWaiting) {
      const cb = this.readWaiting;
      this.readWaiting = null;
      cb();
    }
  }

  handleWindowUpdate(delta: number): void {
    this.sendWindow += delta;
    while (this.sendResolvers.length > 0 && this.sendWindow > 0) {
      const r = this.sendResolvers.shift()!;
      r.resolve();
    }
  }

  private sendWindowUpdate(delta: number): void {
    if (delta <= 0) return;
    this.recvWindow += delta;
    this.session
      .writeFrame(MsgType.WindowUpdate, 0, this.streamID, Buffer.alloc(0), delta)
      .catch(() => {});
  }

  public isClosed(): boolean {
    return this._closed || this.destroyed;
  }
}

export class YamuxSession extends EventEmitter {
  private conn: Duplex;
  private isServer: boolean;
  private config: YamuxConfig;
  private nextStreamID: number;
  private streams: Map<number, YamuxStream> = new Map();
  private acceptQueue: YamuxStream[] = [];
  private acceptResolvers: Array<(stream: YamuxStream | null) => void> = [];
  private _closed: boolean = false;
  private pingID: number = 0;
  private pingResolvers: Map<number, () => void> = new Map();
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private readBuffer: Buffer = Buffer.alloc(0);
  private writeLock: Promise<void> = Promise.resolve();

  constructor(conn: Duplex, isServer: boolean, config?: Partial<YamuxConfig>) {
    super();
    this.conn = conn;
    this.isServer = isServer;
    this.config = { ...defaultConfig, ...config };
    this.nextStreamID = isServer ? 2 : 1;

    this.conn.on('data', (data: Buffer) => this.onData(data));
    this.conn.on('error', (err: Error) => this.handleError(err));
    this.conn.on('close', () => this.handleClose());
    this.conn.on('end', () => this.handleClose());

    if (this.config.enableKeepAlive) {
      this.keepAliveTimer = setInterval(() => {
        this.ping().catch(() => {});
      }, this.config.keepAliveInterval);
      // Allow process to exit even if keep-alive is running
      if (this.keepAliveTimer.unref) {
        this.keepAliveTimer.unref();
      }
    }
  }

  private onData(data: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, data]);
    this.processBuffer();
  }

  private processBuffer(): void {
    while (this.readBuffer.length >= HEADER_SIZE) {
      const header = decodeHeader(this.readBuffer);
      if (header.version !== PROTO_VERSION) {
        this.close(GoAwayCode.ProtoError);
        return;
      }

      const totalLen = header.type === MsgType.Data ? HEADER_SIZE + header.length : HEADER_SIZE;
      if (this.readBuffer.length < totalLen) break;

      const body =
        header.type === MsgType.Data
          ? this.readBuffer.subarray(HEADER_SIZE, HEADER_SIZE + header.length)
          : Buffer.alloc(0);
      this.readBuffer = this.readBuffer.subarray(totalLen);

      this.handleFrame(header, body);
    }
  }

  private handleFrame(header: Header, body: Buffer): void {
    switch (header.type) {
      case MsgType.Data:
      case MsgType.WindowUpdate:
        this.handleStreamMessage(header, body);
        break;
      case MsgType.Ping:
        this.handlePing(header);
        break;
      case MsgType.GoAway:
        this.handleGoAway(header);
        break;
    }
  }

  private handleStreamMessage(header: Header, body: Buffer): void {
    if (header.flags & Flag.SYN) {
      if (this.streams.has(header.streamID)) return;
      const stream = new YamuxStream(this, header.streamID);
      this.streams.set(header.streamID, stream);
      this.writeFrame(MsgType.WindowUpdate, Flag.ACK, header.streamID, Buffer.alloc(0)).catch(
        () => {},
      );
      if (this.acceptResolvers.length > 0) {
        const resolve = this.acceptResolvers.shift()!;
        resolve(stream);
      } else {
        this.acceptQueue.push(stream);
      }
      if (body.length > 0 || header.flags & ~Flag.SYN) {
        stream.handleData(body, header.flags & ~Flag.SYN);
      }
      return;
    }

    const stream = this.streams.get(header.streamID);
    if (!stream) return;

    if (header.type === MsgType.Data) {
      stream.handleData(body, header.flags);
    } else if (header.type === MsgType.WindowUpdate) {
      stream.handleWindowUpdate(header.length);
    }
  }

  private handlePing(header: Header): void {
    if (header.flags & Flag.SYN) {
      this.writeFrame(MsgType.Ping, Flag.ACK, 0, Buffer.alloc(0), header.length).catch(() => {});
    } else if (header.flags & Flag.ACK) {
      const resolver = this.pingResolvers.get(header.length);
      if (resolver) {
        this.pingResolvers.delete(header.length);
        resolver();
      }
    }
  }

  private handleGoAway(_header: Header): void {
    this._closed = true;
    this.closeAllStreams();
  }

  private handleError(err: Error): void {
    this.emit('error', err);
    this.handleClose();
  }

  private handleClose(): void {
    if (this._closed) return;
    this._closed = true;
    this.closeAllStreams();
    this.emit('close');
  }

  private closeAllStreams(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    for (const stream of this.streams.values()) {
      stream.destroy();
    }
    this.streams.clear();
    for (const resolver of this.acceptResolvers) {
      resolver(null);
    }
    this.acceptResolvers = [];
  }

  async writeFrame(
    type: MsgType,
    flags: number,
    streamID: number,
    data: Buffer,
    lengthOverride?: number,
  ): Promise<void> {
    const prev = this.writeLock;
    let resolveLock!: () => void;
    this.writeLock = new Promise<void>((r) => (resolveLock = r));
    await prev;
    try {
      const length = lengthOverride !== undefined ? lengthOverride : data.length;
      const header = encodeHeader(type, flags, streamID, length);
      const frame = data.length > 0 ? Buffer.concat([header, data]) : header;
      await new Promise<void>((resolve, reject) => {
        this.conn.write(frame, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } finally {
      resolveLock();
    }
  }

  async acceptStream(): Promise<YamuxStream> {
    if (this._closed) throw new Error('session is closed');
    if (this.acceptQueue.length > 0) {
      return this.acceptQueue.shift()!;
    }
    return new Promise<YamuxStream>((resolve, reject) => {
      if (this._closed) {
        reject(new Error('session is closed'));
        return;
      }
      this.acceptResolvers.push((stream) => {
        if (!stream) reject(new Error('session is closed'));
        else resolve(stream);
      });
    });
  }

  async openStream(): Promise<YamuxStream> {
    if (this._closed) throw new Error('session is closed');
    const id = this.nextStreamID;
    this.nextStreamID += 2;
    const stream = new YamuxStream(this, id);
    this.streams.set(id, stream);
    await this.writeFrame(MsgType.Data, Flag.SYN, id, Buffer.alloc(0));
    return stream;
  }

  async ping(): Promise<void> {
    const id = this.pingID++;
    await this.writeFrame(MsgType.Ping, Flag.SYN, 0, Buffer.alloc(0), id);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pingResolvers.delete(id);
        reject(new Error('ping timeout'));
      }, 30000);
      this.pingResolvers.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async close(code: GoAwayCode = GoAwayCode.Normal): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    try {
      await this.writeFrame(MsgType.GoAway, 0, 0, Buffer.alloc(0), code);
    } catch {}
    this.closeAllStreams();
    this.conn.end();
  }

  removeStream(id: number): void {
    this.streams.delete(id);
  }

  isClosed(): boolean {
    return this._closed;
  }

  numStreams(): number {
    return this.streams.size;
  }
}

export function createServerSession(
  conn: Duplex,
  config?: Partial<YamuxConfig>,
): YamuxSession {
  return new YamuxSession(conn, true, config);
}

export function createClientSession(
  conn: Duplex,
  config?: Partial<YamuxConfig>,
): YamuxSession {
  return new YamuxSession(conn, false, config);
}
