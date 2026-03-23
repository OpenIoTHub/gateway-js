import { Duplex } from 'stream';
import { NewService, JsonResponse } from '../../../../models/models';
import { Ipv6ClientHandleTask } from '../../../../models/chansData';
import { clientTaskChan } from '../../../../chans/chans';
import { ipv6ListenTcpHandlePort } from '../../../../config/config';
import { writeMsg, createTypedMessage } from '../../../../utils/msg/process';
import os from 'os';

function isIPv6Family(family: string | number): boolean {
  return family === 'IPv6' || family === 6;
}

function getPublicIPv6(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (isIPv6Family(addr.family) && !addr.internal && !addr.address.startsWith('fe80')) {
        return addr.address;
      }
    }
  }
  return '';
}

export async function getIPv6Addr(
  stream: Duplex,
  service: NewService,
  localGatewayToken: string,
): Promise<void> {
  try {
    if (!localGatewayToken) {
      throw new Error('GetIPv6Addr 需要有效的网关 token');
    }
    let remoteConfig: Omit<Ipv6ClientHandleTask, 'LocalGatewayToken'>;
    try {
      remoteConfig = JSON.parse(service.Config);
    } catch (err) {
      throw new Error(`解析 IPv6 配置失败: ${err}`);
    }
    const task: Ipv6ClientHandleTask = {
      ...remoteConfig,
      LocalGatewayToken: localGatewayToken,
    };
    clientTaskChan.send(task);

    const ipv6Addr = getPublicIPv6();
    const ipv6Info: Omit<Ipv6ClientHandleTask, 'LocalGatewayToken'> = {
      RunId: '',
      Ipv6AddrIp: ipv6Addr,
      Ipv6AddrPort: ipv6ListenTcpHandlePort,
    };

    const response = createTypedMessage<JsonResponse>('JsonResponse', {
      Code: 0,
      Msg: 'Success',
      Result: JSON.stringify(ipv6Info),
    });
    await writeMsg(stream, response);
  } catch (err) {
    console.error(`GetIPv6Addr 失败: ${err}`);
    try { stream.destroy(); } catch {}
    throw err;
  }
}
