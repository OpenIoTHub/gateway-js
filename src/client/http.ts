import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { configMode } from '../config/config';
import { registerService } from '../register/registerService';
import { gatewayManager } from '../services/gatewayManager';
import { indexHandler, displayQrHandler } from '../services/httpHandler';

export function startHTTP(): void {
  const port = configMode.http_service_port || 34323;

  registerService(
    'localhost-gateway-js',
    '_http._tcp',
    'local',
    'localhost',
    port,
    [
      'name=gateway-js',
      `id=gateway-js@${uuidv4()}`,
      'home-page=https://github.com/OpenIoTHub/gateway-go',
    ],
    0,
    ['127.0.0.1'],
    [],
  );

  const app = express();

  app.get('/', indexHandler(gatewayManager));
  app.get('/DisplayQrHandler', displayQrHandler(gatewayManager));

  const server = app.listen(port, () => {
    console.log(`Http 监听端口: ${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`HTTP 端口 ${port} 已被占用，请检查是否有其他实例运行`);
    } else {
      console.error(`HTTP 服务启动失败: ${err}`);
    }
  });
}
