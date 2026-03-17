import { URL } from 'url';
import { gatewayManager } from './gatewayManager';
import { configMode, configFilePath } from '../config/config';
import { writeConfigFile } from '../config/configFile';
import { displayQRCodeById } from '../utils/qr/qrService';

const IOT_MANAGER_ADDR = 'api.iot-manager.iothub.cloud:50051';

export async function autoLoginAndDisplayQRCode(): Promise<void> {
  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const path = await import('path');

    const PROTO_PATH = path.join(__dirname, '..', 'proto', 'publicApi.proto');

    let client: any;

    try {
      const packageDefinition = await protoLoader.load(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const pb = protoDescriptor.pb as any;
      client = new pb.PublicApi(
        IOT_MANAGER_ADDR,
        grpc.credentials.createSsl(),
      );
    } catch {
      // If proto file not available, use dynamic approach
      console.log('gRPC proto 文件不可用，尝试使用 HTTP API 自动登录');
      await autoLoginViaHTTP();
      return;
    }

    const rst = await new Promise<any>((resolve, reject) => {
      client.GenerateJwtQRCodePair({}, (err: Error | null, response: any) => {
        if (err) reject(err);
        else resolve(response);
      });
    });

    await gatewayManager.addServer(rst.GatewayJwt);

    const qrs = new URL(rst.QRCodeForMobileAdd);
    const host = qrs.searchParams.get('host') || '';
    const runId = qrs.searchParams.get('id') || '';

    if (!runId) {
      throw new Error('url id is empty in QRCodeForMobileAdd');
    }

    configMode.loginwithtokenmap[runId] = rst.GatewayJwt;
    writeConfigFile(configMode, configFilePath);
    displayQRCodeById(runId, host);
  } catch (err) {
    console.error(`自动登录失败: ${err}`);
    throw err;
  }
}

async function autoLoginViaHTTP(): Promise<void> {
  try {
    const https = await import('https');
    const url = new URL('https://api.iot-manager.iothub.cloud/v1/generateJwtQRCodePair');
    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`服务器返回非JSON内容: ${data.substring(0, 200)}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write('{}');
      req.end();
    });

    if (result.GatewayJwt) {
      await gatewayManager.addServer(result.GatewayJwt);
      const qrs = new URL(result.QRCodeForMobileAdd);
      const host = qrs.searchParams.get('host') || '';
      const runId = qrs.searchParams.get('id') || '';
      if (runId) {
        configMode.loginwithtokenmap[runId] = result.GatewayJwt;
        writeConfigFile(configMode, configFilePath);
        displayQRCodeById(runId, host);
      }
    }
  } catch (err) {
    console.error(`HTTP 自动登录失败: ${err}`);
    throw err;
  }
}
