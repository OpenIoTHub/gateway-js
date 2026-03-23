import jwt from 'jsonwebtoken';
import { TokenClaims } from './models';

export function decodeUnverifiedToken(tokenStr: string): TokenClaims {
  const decoded = jwt.decode(tokenStr, { complete: true });
  if (!decoded || !decoded.payload || typeof decoded.payload === 'string') {
    throw new Error('token or token.Claims is nil');
  }
  const payload = decoded.payload as Record<string, any>;
  return {
    RunId: payload.RunId ?? '',
    Host: payload.Host ?? '',
    TcpPort: payload.TcpPort ?? 0,
    KcpPort: payload.KcpPort ?? 0,
    TlsPort: payload.TlsPort ?? 0,
    GrpcPort: payload.GrpcPort ?? 0,
    UDPApiPort:
      payload.UDPApiPort ?? payload.udpApiPort ?? payload.UdpApiPort ?? 0,
    KCPApiPort: payload.KCPApiPort ?? 0,
    Permission: payload.Permission ?? [],
    Txts: payload.Txts ?? {},
    iat: payload.iat,
    exp: payload.exp,
    nbf: payload.nbf,
  };
}

export function decodeToken(salt: string, tokenStr: string): TokenClaims {
  const decoded = jwt.verify(tokenStr, salt) as Record<string, any>;
  return {
    RunId: decoded.RunId ?? '',
    Host: decoded.Host ?? '',
    TcpPort: decoded.TcpPort ?? 0,
    KcpPort: decoded.KcpPort ?? 0,
    TlsPort: decoded.TlsPort ?? 0,
    GrpcPort: decoded.GrpcPort ?? 0,
    UDPApiPort:
      decoded.UDPApiPort ?? decoded.udpApiPort ?? decoded.UdpApiPort ?? 0,
    KCPApiPort: decoded.KCPApiPort ?? 0,
    Permission: decoded.Permission ?? [],
    Txts: decoded.Txts ?? {},
    iat: decoded.iat,
    exp: decoded.exp,
    nbf: decoded.nbf,
  };
}
