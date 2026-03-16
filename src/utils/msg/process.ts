import { Duplex } from 'stream';
import net from 'net';
import { Message, TypeMap, TypeStringMap } from '../../models/models';

type ReadableStream = net.Socket | Duplex;
type WritableStream = net.Socket | Duplex;

export function readExactBytes(stream: ReadableStream, size: number): Promise<Buffer> {
  if (size === 0) return Promise.resolve(Buffer.alloc(0));
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    let settled = false;

    const tryRead = () => {
      if (settled) return;
      while (bytesRead < size) {
        const remaining = size - bytesRead;
        const chunk = stream.read(remaining) as Buffer | null;
        if (chunk === null) {
          stream.once('readable', tryRead);
          return;
        }
        chunks.push(chunk);
        bytesRead += chunk.length;
      }
      settle();
      resolve(Buffer.concat(chunks, size));
    };

    const onError = (err: Error) => {
      settle();
      reject(err);
    };

    const onEnd = () => {
      settle();
      reject(new Error('stream ended before reading enough data'));
    };

    const onClose = () => {
      settle();
      reject(new Error('stream closed'));
    };

    const settle = () => {
      if (settled) return;
      settled = true;
      stream.removeListener('readable', tryRead);
      stream.removeListener('error', onError);
      stream.removeListener('end', onEnd);
      stream.removeListener('close', onClose);
    };

    stream.on('error', onError);
    stream.on('end', onEnd);
    stream.on('close', onClose);

    tryRead();
  });
}

async function readLenPrefixed(stream: ReadableStream): Promise<Buffer> {
  const lenBuf = await readExactBytes(stream, 4);
  const len = lenBuf.readUInt32BE(0);
  if (len === 0) return Buffer.alloc(0);
  if (len > 8 * 1024 * 1024) throw new Error('message too large');
  return readExactBytes(stream, len);
}

function writeLenPrefixed(stream: WritableStream, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const frame = Buffer.concat([lenBuf, data]);
    stream.write(frame, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function readMsg(stream: ReadableStream): Promise<{ type: string; msg: Message }> {
  const typeBuf = await readLenPrefixed(stream);
  if (!typeBuf || typeBuf.length === 0) {
    throw new Error('failed to read type');
  }
  const typeString = typeBuf.toString('utf8');
  if (!TypeMap[typeString]) {
    throw new Error(`unsupported message type: ${typeString}`);
  }

  const bodyBuf = await readLenPrefixed(stream);
  let msg: Message;
  try {
    msg = JSON.parse(bodyBuf.toString('utf8')) as Message;
  } catch (err) {
    throw new Error(`failed to parse message body: ${err}`);
  }
  return { type: typeString, msg };
}

export async function writeMsg(stream: WritableStream, msg: Message & { _typeName?: string }): Promise<void> {
  const typeName = msg._typeName;
  if (!typeName) {
    throw new Error('message must have _typeName set via createTypedMessage()');
  }
  const goTypeString = TypeStringMap[typeName];
  if (!goTypeString) {
    throw new Error(`unknown message type: ${typeName}`);
  }

  const serializable = { ...msg };
  delete (serializable as any)._typeName;

  await writeLenPrefixed(stream, Buffer.from(goTypeString, 'utf8'));
  await writeLenPrefixed(stream, Buffer.from(JSON.stringify(serializable), 'utf8'));
}

export function createTypedMessage<T extends Message>(typeName: string, data: T): T & { _typeName: string } {
  return { ...data, _typeName: typeName };
}
