import { MDNSResult } from '../../models/models';

interface ContainerPort {
  Type: string;
  PublicPort?: number;
}

interface ContainerInfo {
  Id: string;
  Names: string[];
  Ports: ContainerPort[];
}

export async function getContainersInfo(): Promise<ContainerInfo[]> {
  try {
    const Dockerode = (await import('dockerode')).default;
    const docker = new Dockerode();
    const containers = await docker.listContainers({ all: true });
    return containers.map((c: any) => ({
      Id: c.Id,
      Names: c.Names,
      Ports: c.Ports.map((p: any) => ({
        Type: p.Type,
        PublicPort: p.PublicPort,
      })),
    }));
  } catch (err) {
    // Docker may not be available
    return [];
  }
}

export async function getContainersServices(): Promise<MDNSResult[]> {
  const rst: MDNSResult[] = [];
  try {
    const containers = await getContainersInfo();
    for (const item of containers) {
      let port = 0;
      for (const p of item.Ports) {
        if (p.Type === 'tcp' && p.PublicPort) {
          port = p.PublicPort;
        }
      }
      let name = 'Docker Service';
      if (item.Names.length > 0) {
        name = item.Names[0].replace(/^\//, '');
      }
      rst.push({
        name: item.Id,
        type: '_http._tcp',
        domain: 'local',
        hostname: 'localhost',
        port,
        text: [`name=${name}`, `id=${item.Id}`],
        ttl: 0,
        addripv4: ['127.0.0.1'],
        addripv6: [],
      });
    }
  } catch (err) {
    // Docker may not be available
  }
  return rst;
}
