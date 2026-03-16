export interface GatewayConfig {
  gatewayuuid: string;
  logconfig: LogConfig | null;
  http_service_port: number;
  loginwithtokenmap: Record<string, string>;
}

export interface LogConfig {
  enablestdout: boolean;
  logfilepath: string;
}
