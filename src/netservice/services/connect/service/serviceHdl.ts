import { Duplex } from 'stream';
import { NewService, JsonResponse } from '../../../../models/models';
import { writeMsg, createTypedMessage } from '../../../../utils/msg/process';
import { findAllmDNS } from './mdns/mdns';
import { scanPort } from './scanPort';
import { listenMulticastUDP } from './listenMulticastUDP';
import { getSystemStatus } from './systemStatus';
import { getIPv6Addr } from './getIPv6Addr';

export async function serviceHdl(stream: Duplex, service: NewService): Promise<void> {
  switch (service.Type) {
    case 'tap':
    case 'tun':
      // TAP/TUN requires OS-level permissions, limited support in Node.js
      console.log(`TAP/TUN 在 Node.js 中暂不支持: ${service.Type}`);
      const errResponse = createTypedMessage<JsonResponse>('JsonResponse', {
        Code: 1,
        Msg: 'Failed',
        Result: 'TAP/TUN not supported in Node.js version',
      });
      await writeMsg(stream, errResponse);
      stream.destroy();
      break;
    case 'mDNSFind':
      await findAllmDNS(stream, service);
      break;
    case 'scanPort':
      await scanPort(stream, service);
      break;
    case 'ListenMulticastUDP':
      await listenMulticastUDP(stream, service);
      break;
    case 'GetSystemStatus':
      await getSystemStatus(stream, service);
      break;
    case 'GetIPv6Addr':
      await getIPv6Addr(stream, service);
      break;
    default: {
      const response = createTypedMessage<JsonResponse>('JsonResponse', {
        Code: 1,
        Msg: 'Failed',
        Result: 'Unknown service type',
      });
      await writeMsg(stream, response);
      stream.destroy();
      break;
    }
  }
}
