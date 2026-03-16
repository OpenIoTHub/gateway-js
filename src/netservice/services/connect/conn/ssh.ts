import { Client } from 'ssh2';
import { Duplex } from 'stream';

export async function joinSSH(
  stream: Duplex,
  remoteIP: string,
  remotePort: number,
  userName: string,
  passWord: string,
): Promise<void> {
  const client = new Client();

  return new Promise<void>((resolve, reject) => {
    client.on('ready', () => {
      client.shell(
        {
          term: 'xterm',
          rows: 25,
          cols: 80,
          modes: {
            ECHO: 1,
            TTY_OP_ISPEED: 14400,
            TTY_OP_OSPEED: 14400,
          },
        },
        (err, channel) => {
          if (err) {
            reject(err);
            return;
          }

          channel.pipe(stream, { end: false });
          stream.pipe(channel, { end: false });

          const cleanup = () => {
            try { channel.close(); } catch {}
            try { client.end(); } catch {}
            if (!stream.destroyed) stream.destroy();
          };

          channel.on('close', cleanup);
          channel.on('end', cleanup);
          stream.on('end', cleanup);
          stream.on('error', (err) => {
            console.error(`SSH stream 错误: ${err.message}`);
            cleanup();
          });
          stream.on('close', cleanup);

          resolve();
        },
      );
    });

    client.on('error', (err) => {
      if (!stream.destroyed) stream.destroy();
      reject(err);
    });

    client.connect({
      host: remoteIP,
      port: remotePort,
      username: userName,
      password: passWord,
    });
  });
}
