import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { GatewayCtl } from './gatewayManager';
import { STD_HOST, getQrContentById, getQrContentByIdAndHost } from '../utils/qr/qrService';

export function indexHandler(gm: GatewayCtl) {
  return (_req: Request, res: Response): void => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>OpenIoThub gateway-js - NAT tool for remote control</title>
    <style>
        body {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        img {
            max-width: 100%;
            height: auto;
            margin-bottom: 20px;
        }
        .tip {
            color: green;
            text-align: center;
            font-size: 1.2em;
        }
    </style>
</head>
<body>
    <img src="/DisplayQrHandler" alt="扫码添加二维码">
    <div class="tip">使用<a href="https://m.malink.cn/s/RNzqia">云亿连</a>(从应用市场搜索下载或拷贝本链接在移动端打开)扫描上述二维码添加本网关，然后添加主机，主机下面添加端口就可以访问目标端口了！<a href="https://www.bilibili.com/video/BV1Tw9pYJE4B">视频教程🌐</a><a href="https://docs.iothub.cloud/typical/index.html#casaoszimaos">文档🌐</a><a href="https://github.com/OpenIoTHub/gateway-go">开源地址🌐</a></div>
    <div class="tip">Use <a href="https://github.com/OpenIoTHub/OpenIoTHub">OpenIoTHub</a> to scan the above QR code and add a gateway,then add host,add host's port,finally, enjoy remote control.<a href="https://github.com/OpenIoTHub/gateway-go">HomePage🌐</a></div>
</body>
</html>`;
    res.type('text/html').send(htmlContent);
  };
}

export function displayQrHandler(gm: GatewayCtl) {
  return async (_req: Request, res: Response): Promise<void> => {
    if (!gm.logged()) {
      res.type('text/plain').send('no gateway login');
      return;
    }
    try {
      const { gatewayUUID, serverHost } = gm.getLoginInfo();
      let qrContent: string;
      if (!serverHost || serverHost === STD_HOST) {
        qrContent = getQrContentById(gatewayUUID);
      } else {
        qrContent = getQrContentByIdAndHost(gatewayUUID, serverHost);
      }
      const qrImage = await QRCode.toBuffer(qrContent, { width: 300 });
      res.type('image/png').send(qrImage);
    } catch (err) {
      res.type('text/plain').send(String(err));
    }
  };
}
