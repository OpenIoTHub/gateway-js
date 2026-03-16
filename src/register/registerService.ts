import { MDNSResult } from '../models/models';
import { getContainersServices } from '../utils/docker/docker';

const registeredServices: MDNSResult[] = [];

export function registerService(
  instance: string,
  service: string,
  domain: string,
  hostname: string,
  port: number,
  text: string[],
  ttl: number,
  addrIPv4: string[],
  addrIPv6: string[],
): void {
  registeredServices.push({
    name: instance,
    type: service,
    domain,
    hostname,
    port,
    text,
    ttl,
    addripv4: addrIPv4,
    addripv6: addrIPv6,
  });
}

export function getRegisteredServices(): MDNSResult[] {
  const tmp = [...registeredServices];
  // Docker services are loaded asynchronously
  // For sync API compatibility, we return what we have
  return tmp;
}

export async function getRegisteredServicesAsync(): Promise<MDNSResult[]> {
  const tmp = [...registeredServices];
  try {
    const dockerServices = await getContainersServices();
    tmp.push(...dockerServices);
  } catch {}
  return tmp;
}
