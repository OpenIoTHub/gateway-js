import { Duplex } from 'stream';
import { NewService, JsonResponse } from '../../../../models/models';
import { writeMsg, createTypedMessage } from '../../../../utils/msg/process';

export async function getSystemStatus(stream: Duplex, _service: NewService): Promise<void> {
  try {
    const si = await import('systeminformation');
    const statMap: Record<string, any> = {};

    const [osInfo, memInfo, cpuData, netIO, fsSize] = await Promise.all([
      si.osInfo().catch(() => null),
      si.mem().catch(() => null),
      si.cpu().catch(() => null),
      si.networkStats().catch(() => []),
      si.fsSize().catch(() => []),
    ]);

    // Host info
    let time: { uptime: number };
    try {
      time = si.time();
    } catch {
      time = { uptime: 0 };
    }
    statMap.hosts = {
      uptime: time.uptime || 0,
      bootTime: 0,
      procs: 0,
      os: osInfo?.platform || process.platform,
      platform: osInfo?.distro || '',
      platformVersion: osInfo?.release || '',
      kernelArch: osInfo?.arch || process.arch,
      kernelVersion: osInfo?.kernel || '',
    };

    // Memory info
    if (memInfo) {
      statMap.mems = {
        total: memInfo.total,
        available: memInfo.available,
        used: memInfo.used,
        free: memInfo.free,
        usedPercent: memInfo.total > 0 ? (memInfo.used / memInfo.total) * 100 : 0,
        buffers: memInfo.buffers || 0,
        shared: 0,
        cached: memInfo.cached || 0,
      };
    } else {
      const osMem = await import('os');
      const total = osMem.totalmem();
      const free = osMem.freemem();
      statMap.mems = {
        total, available: free, used: total - free, free,
        usedPercent: total > 0 ? ((total - free) / total) * 100 : 0,
        buffers: 0, shared: 0, cached: 0,
      };
    }

    // CPU info
    statMap.cpus = cpuData
      ? [{ cpu: 1, cores: cpuData.cores, modelName: cpuData.brand }]
      : [{ cpu: 1, cores: 0, modelName: 'unknown' }];

    // Network IO
    statMap.ios = (netIO as any[]).map((io: any) => ({
      ioName: io.iface,
      bytesSent: io.tx_bytes,
      bytesRecv: io.rx_bytes,
      packetsSent: io.tx_dropped || 0,
      packetsRecv: io.rx_dropped || 0,
    }));

    // Disk info
    statMap.disks = (fsSize as any[]).map((fs: any) => ({
      disk: fs.mount,
      total: fs.size,
      free: fs.available,
      used: fs.used,
      usedPercent: fs.use || 0,
    }));

    statMap.code = 0;
    statMap.message = 'success';

    const response = createTypedMessage<JsonResponse>('JsonResponse', {
      Code: 0,
      Msg: 'Success',
      Result: JSON.stringify(statMap),
    });
    await writeMsg(stream, response);
  } catch (err) {
    console.error(`获取系统状态失败: ${err}`);
    throw err;
  }
}
