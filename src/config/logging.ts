import fs from 'fs';
import { LogConfig } from './types';

export function setupLogging(logConfig: LogConfig | null): void {
  if (!logConfig) return;

  if (logConfig.logfilepath) {
    let logStream: fs.WriteStream;
    try {
      logStream = fs.createWriteStream(logConfig.logfilepath, { flags: 'a' });
    } catch (err) {
      console.error(`打开日志文件失败: ${err}`);
      return;
    }

    logStream.on('error', (err) => {
      process.stderr.write(`日志文件写入错误: ${err}\n`);
    });

    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      const line = `${new Date().toISOString()} ${msg}\n`;
      if (logConfig.enablestdout) {
        originalLog(...args);
      }
      logStream.write(line);
    };

    console.error = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      const line = `${new Date().toISOString()} ERROR ${msg}\n`;
      if (logConfig.enablestdout) {
        originalError(...args);
      }
      logStream.write(line);
    };
  }
}
