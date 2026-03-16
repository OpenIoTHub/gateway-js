import { MDNSResult } from '../../../../../models/models';

export class MdnsCtrl {
  private serviceTypeList: Map<string, boolean> = new Map();
  private serviceTypeServiceMap: Map<string, MDNSResult[]> = new Map();

  constructor() {}

  startService(): void {
    // mDNS background discovery (optional, runs periodically)
  }

  getServiceTypeList(): Map<string, boolean> {
    return this.serviceTypeList;
  }

  getServiceTypeServiceMap(): Map<string, MDNSResult[]> {
    return this.serviceTypeServiceMap;
  }
}

export const mdnsManager = new MdnsCtrl();
