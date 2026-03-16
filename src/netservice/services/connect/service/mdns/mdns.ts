import { Duplex } from 'stream';
import { NewService, FindmDNS, MDNSResult, JsonResponse } from '../../../../../models/models';
import { writeMsg, createTypedMessage } from '../../../../../utils/msg/process';
import { getRegisteredServices } from '../../../../../register/registerService';

export async function findAllmDNS(stream: Duplex, service: NewService): Promise<void> {
  try {
    let config: FindmDNS;
    try {
      config = JSON.parse(service.Config);
    } catch (err) {
      throw new Error(`解析 mDNS 配置失败: ${err}`);
    }
    let rst: MDNSResult[] = [];

    try {
      const Bonjour = (await import('bonjour-service')).default;
      const bonjour = new Bonjour();

      const timeoutMs = (config.Second || 4) * 250;
      const discoveredServices: MDNSResult[] = [];

      await new Promise<void>((resolve) => {
        const browser = bonjour.find({ type: config.Service.replace(/^_/, '').replace(/\._tcp$|_udp$/, '') }, (svc: any) => {
          discoveredServices.push({
            name: svc.name || '',
            type: svc.type || config.Service,
            domain: config.Domain || 'local',
            hostname: svc.host || '',
            port: svc.port || 0,
            text: svc.txt ? Object.entries(svc.txt).map(([k, v]) => `${k}=${v}`) : [],
            ttl: 0,
            addripv4: svc.addresses?.filter((a: string) => a.includes('.')) || [],
            addripv6: svc.addresses?.filter((a: string) => a.includes(':')) || [],
          });
        });

        setTimeout(() => {
          browser.stop();
          bonjour.destroy();
          resolve();
        }, timeoutMs);
      });

      rst = discoveredServices;
    } catch {
      // mDNS discovery not available
    }

    const registeredServices = getRegisteredServices();

    if (config.Service === '_services._dns-sd._udp') {
      const registeredTypes: string[] = [];
      for (const svc of registeredServices) {
        if (!registeredTypes.includes(svc.type)) {
          rst.push({
            name: svc.type + '.local',
            type: '_services._dns-sd._udp',
            domain: 'local',
            hostname: '',
            port: 0,
            text: [],
            ttl: 0,
            addripv4: [],
            addripv6: [],
          });
          registeredTypes.push(svc.type);
        }
      }
    } else {
      rst.push(...registeredServices);
    }

    const response = createTypedMessage<JsonResponse>('JsonResponse', {
      Code: 0,
      Msg: 'Success',
      Result: JSON.stringify(rst),
    });
    await writeMsg(stream, response);
  } catch (err) {
    console.error('mDNS 发现失败:', err);
    throw err;
  }
}
