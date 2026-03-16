import { Duplex } from 'stream';
import net from 'net';

type DuplexLike = Duplex | net.Socket;

export function join(p1: DuplexLike, p2: DuplexLike): void {
  const p1die = new Promise<void>((resolve) => {
    p1.on('data', (chunk: Buffer) => {
      if (!p2.destroyed) {
        const ok = p2.write(chunk);
        if (!ok) p1.pause();
      }
    });
    p2.on('drain', () => {
      if (!p1.destroyed) p1.resume();
    });
    p1.on('end', resolve);
    p1.on('error', (err) => {
      console.error(`join p1 error: ${err.message}`);
      resolve();
    });
    p1.on('close', resolve);
  });

  const p2die = new Promise<void>((resolve) => {
    p2.on('data', (chunk: Buffer) => {
      if (!p1.destroyed) {
        const ok = p1.write(chunk);
        if (!ok) p2.pause();
      }
    });
    p1.on('drain', () => {
      if (!p2.destroyed) p2.resume();
    });
    p2.on('end', resolve);
    p2.on('error', (err) => {
      console.error(`join p2 error: ${err.message}`);
      resolve();
    });
    p2.on('close', resolve);
  });

  Promise.race([p1die, p2die]).then(() => {
    if (!p1.destroyed) p1.destroy();
    if (!p2.destroyed) p2.destroy();
  });
}
