import { Duplex } from 'stream';
import { ConnectSerialPort } from '../../../../models/models';

export async function joinSerialPort(stream: Duplex, m: ConnectSerialPort): Promise<void> {
  try {
    const { SerialPort } = await import('serialport');

    const dataBits = m.DataBits && [5, 6, 7, 8].includes(m.DataBits) ? m.DataBits as 5 | 6 | 7 | 8 : 8;
    const stopBits = m.StopBits && [1, 1.5, 2].includes(m.StopBits) ? m.StopBits as 1 | 1.5 | 2 : 1;
    const parity = m.ParityMode === 1 ? 'odd' as const
      : m.ParityMode === 2 ? 'even' as const
      : 'none' as const;

    const port = new SerialPort({
      path: m.PortName,
      baudRate: m.BaudRate || 9600,
      dataBits,
      stopBits,
      parity,
    });

    await new Promise<void>((resolve, reject) => {
      port.on('open', resolve);
      port.on('error', reject);
    });

    port.pipe(stream, { end: false });
    stream.pipe(port, { end: false });

    const cleanup = () => {
      try { port.close(); } catch {}
      if (!stream.destroyed) stream.destroy();
    };

    port.on('close', cleanup);
    port.on('error', (err) => {
      console.error(`串口错误: ${err}`);
      cleanup();
    });
    stream.on('end', cleanup);
    stream.on('error', (err) => {
      console.error(`串口 stream 错误: ${err}`);
      cleanup();
    });
    stream.on('close', cleanup);
  } catch (err) {
    console.error('串口连接失败:', err);
    if (!stream.destroyed) stream.destroy();
    throw err;
  }
}
