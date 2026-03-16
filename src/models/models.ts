export interface Message {}

// --- Login Messages ---
export interface GatewayLogin extends Message {
  Token: string;
  Os: string;
  Arch: string;
  Version: string;
  DisableMuxer?: boolean;
}

export interface GatewayWorkConn extends Message {
  RunId: string;
  Secret: string;
  Version: string;
}

export interface OpenIoTHubLogin extends Message {
  Token: string;
  Os: string;
  Arch: string;
  Version: string;
}

// --- Connection Messages ---
export interface ConnectTCP extends Message {
  TargetIP: string;
  TargetPort: number;
}

export interface ConnectSTCP extends Message {
  TargetIP: string;
  TargetPort: number;
}

export interface ConnectUDP extends Message {
  TargetIP: string;
  TargetPort: number;
}

export interface ConnectSerialPort extends Message {
  PortName: string;
  BaudRate: number;
  DataBits: number;
  StopBits: number;
  MinimumReadSize: number;
  InterCharacterTimeout: number;
  ParityMode: number;
  Rs485Enable: boolean;
  Rs485RtsHighDuringSend: boolean;
  Rs485RtsHighAfterSend: boolean;
  Rs485RxDuringTx: boolean;
  Rs485DelayRtsBeforeSend: number;
  Rs485DelayRtsAfterSend: number;
}

export interface ConnectWs extends Message {
  TargetUrl: string;
  Protocol: string;
  Origin: string;
}

export interface ConnectWss extends Message {
  TargetUrl: string;
  Protocol: string;
  Origin: string;
}

export interface ConnectSSH extends Message {
  TargetIP: string;
  TargetPort: number;
  UserName: string;
  PassWord: string;
}

// --- Session Messages ---
export interface NewSubSession extends Message {}

export interface RemoteNetInfo extends Message {
  IntranetIp: string;
  IntranetPort: number;
  ExternalIp: string;
  ExternalPort: number;
}

// --- P2P Messages ---
export interface ReqNewP2PCtrlAsServer extends Message {
  IntranetIp: string;
  IntranetPort: number;
  ExternalIp: string;
  ExternalPort: number;
}

export interface ReqNewP2PCtrlAsClient extends Message {
  IntranetIp: string;
  IntranetPort: number;
  ExternalIp: string;
  ExternalPort: number;
}

// --- Status Messages ---
export interface CheckStatusRequest extends Message {
  Type: string;
  Addr: string;
}

export interface CheckStatusResponse extends Message {
  Code: number;
  Message: string;
}

// --- Service Messages ---
export interface NewService extends Message {
  Type: string;
  Config: string;
}

export interface RequestNewWorkConn extends Message {
  Type: string;
  Config: string;
}

// --- Ping/Pong ---
export interface Ping extends Message {}
export interface Pong extends Message {}

// --- Generic ---
export interface OK extends Message {}
export interface ErrorMsg extends Message {
  Code: number;
  Message: string;
}

export interface JsonResponse extends Message {
  Code: number;
  Msg: string;
  Result: string;
}

export interface DeleteGatewayJwt extends Message {}

export interface GetMyUDPPublicAddr extends Message {}

export interface UDPAddr extends Message {
  IP: string;
  Port: number;
  Zone: string;
}

// TypeMap: Go type string -> constructor (for deserialization)
// Go reflect produces "models.XXX" as the type string
export const TypeMap: Record<string, string> = {
  'models.GatewayLogin': 'GatewayLogin',
  'models.GatewayWorkConn': 'GatewayWorkConn',
  'models.OpenIoTHubLogin': 'OpenIoTHubLogin',
  'models.ConnectTCP': 'ConnectTCP',
  'models.ConnectSTCP': 'ConnectSTCP',
  'models.ConnectUDP': 'ConnectUDP',
  'models.ConnectWs': 'ConnectWs',
  'models.ConnectWss': 'ConnectWss',
  'models.ConnectSerialPort': 'ConnectSerialPort',
  'models.ConnectSSH': 'ConnectSSH',
  'models.NewSubSession': 'NewSubSession',
  'models.RemoteNetInfo': 'RemoteNetInfo',
  'models.ReqNewP2PCtrlAsServer': 'ReqNewP2PCtrlAsServer',
  'models.ReqNewP2PCtrlAsClient': 'ReqNewP2PCtrlAsClient',
  'models.CheckStatusRequest': 'CheckStatusRequest',
  'models.CheckStatusResponse': 'CheckStatusResponse',
  'models.NewService': 'NewService',
  'models.RequestNewWorkConn': 'RequestNewWorkConn',
  'models.GetMyUDPPublicAddr': 'GetMyUDPPublicAddr',
  'net.UDPAddr': 'UDPAddr',
  'models.Ping': 'Ping',
  'models.Pong': 'Pong',
  'models.OK': 'OK',
  'models.Error': 'Error',
  'models.JsonResponse': 'JsonResponse',
  'models.DeleteGatewayJwt': 'DeleteGatewayJwt',
};

// Reverse map: local type name -> Go wire type string
export const TypeStringMap: Record<string, string> = {};
for (const [goType, localName] of Object.entries(TypeMap)) {
  TypeStringMap[localName] = goType;
}

// --- Service Discovery Models ---
export interface FindmDNS {
  Service: string;
  Domain: string;
  Second: number;
}

export interface MDNSResult {
  name: string; // Instance
  type: string; // Service
  domain: string;
  hostname: string;
  port: number;
  text: string[];
  ttl: number;
  addripv4: string[];
  addripv6: string[];
}

export interface ScanPort {
  Host: string;
  StartPort: number;
  EndPort: number;
}

// --- JWT Token Claims ---
export interface TokenClaims {
  RunId: string;
  Host: string;
  TcpPort: number;
  KcpPort: number;
  TlsPort: number;
  GrpcPort: number;
  UDPApiPort: number;
  KCPApiPort: number;
  Permission: string[];
  Txts: Record<string, string>;
  iat?: number;
  exp?: number;
  nbf?: number;
}
