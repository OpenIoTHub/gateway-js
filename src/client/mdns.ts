import os from 'os';
import { configMode } from '../config/config';
import { gatewayManager } from '../services/gatewayManager';
import { Version } from '../info/info';

export function registerGatewayMDNS(gRpcPort: number): void {
  let mac = 'mac';
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        mac = addr.mac;
        break;
      }
    }
    if (mac !== 'mac') break;
  }

  let gatewayUUID = '';
  let serverHost = '';
  try {
    const info = gatewayManager.getLoginInfo();
    gatewayUUID = info.gatewayUUID;
    serverHost = info.serverHost;
  } catch {}

  (async () => {
    try {
      const Bonjour = (await import('bonjour-service')).default;
      const bonjour = new Bonjour();
      bonjour.publish({
        name: `OpenIoTHubGateway-${configMode.gatewayuuid}`,
        type: 'openiothub-gateway',
        protocol: 'tcp',
        port: gRpcPort,
        txt: {
          name: '网关',
          model: 'com.iotserv.services.gateway',
          mac,
          id: configMode.gatewayuuid,
          run_id: gatewayUUID,
          server_host: serverHost,
          author: 'Farry',
          email: 'newfarry@126.com',
          'home-page': 'https://github.com/OpenIoTHub',
          'firmware-respository': 'https://github.com/OpenIoTHub/gateway-go/v2',
          'firmware-version': Version,
        },
      });
    } catch (err) {
      console.error(`mDNS 注册失败: ${err}`);
    }
  })();
}
