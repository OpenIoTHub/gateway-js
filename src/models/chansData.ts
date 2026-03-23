export interface Ipv6ClientHandleTask {
  RunId: string;
  Ipv6AddrIp: string;
  Ipv6AddrPort: number;
  /** 由 GetIPv6Addr 处理方填入的本机网关 JWT，供 IPv6 链路上的 handleSession/handleStream 使用 */
  LocalGatewayToken: string;
}
