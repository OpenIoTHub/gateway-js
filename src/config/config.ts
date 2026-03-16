import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { GatewayConfig } from './types';

export const CONFIG_FILE_NAME = 'gateway-go.yaml';

export let configFilePath = `./${CONFIG_FILE_NAME}`;

export let gatewayLoginToken = '';

export const GRPC_ADDR = '';

export let ipv6ListenTcpHandlePort = 0;

export function setIpv6ListenTcpHandlePort(port: number): void {
  ipv6ListenTcpHandlePort = port;
}

export function setConfigFilePath(p: string): void {
  configFilePath = p;
}

export function setGatewayLoginToken(token: string): void {
  gatewayLoginToken = token;
}

export let configMode: GatewayConfig = {
  gatewayuuid: uuidv4(),
  logconfig: {
    enablestdout: true,
    logfilepath: '',
  },
  http_service_port: 34323,
  loginwithtokenmap: {},
};

export function setConfigMode(cfg: GatewayConfig): void {
  configMode = cfg;
}

// Check for SNAP_USER_DATA environment variable
const snapUserData = process.env.SNAP_USER_DATA;
if (snapUserData) {
  configFilePath = path.join(snapUserData, CONFIG_FILE_NAME);
}
