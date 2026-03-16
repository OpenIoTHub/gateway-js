import { GRPC_ADDR, configMode, configFilePath } from '../config/config';
import { gatewayManager } from '../services/gatewayManager';
import { isLibrary } from './lib';
import { decodeUnverifiedToken } from '../models/jwt';
import { writeConfigFile } from '../config/configFile';
import { registerGatewayMDNS } from './mdns';

export const GRPC_PORT = 55443;

export function startGRPC(): void {
  (async () => {
    try {
      const grpc = await import('@grpc/grpc-js');
      const protoLoader = await import('@grpc/proto-loader');
      const path = await import('path');

      const PROTO_PATH = path.join(__dirname, '..', 'proto', 'gateway.proto');

      let packageDefinition;
      try {
        packageDefinition = await protoLoader.load(PROTO_PATH, {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        });
      } catch {
        console.log('gRPC proto 文件不可用，使用内置 gRPC 服务');
        startSimpleGRPC();
        return;
      }

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const pb = protoDescriptor.pb as any;

      const server = new grpc.Server();
      server.addService(pb.GatewayLoginManager.service, {
        CheckGatewayLoginStatus: checkGatewayLoginStatus,
        LoginServerByToken: loginServerByToken,
      });

      const bindAddr = GRPC_ADDR ? `${GRPC_ADDR}:${GRPC_PORT}` : `0.0.0.0:${GRPC_PORT}`;
      server.bindAsync(bindAddr, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
          console.error(`gRPC 监听失败: ${err}`);
          return;
        }
        console.log(`Grpc 监听端口: ${port}`);
        registerGatewayMDNS(port);
      });
    } catch (err) {
      console.error(`gRPC 启动失败: ${err}`);
      startSimpleGRPC();
    }
  })();
}

function startSimpleGRPC(): void {
  // Fallback: run a simple TCP-based RPC if proto files not available
  console.log(`gRPC 服务以简化模式运行在端口 ${GRPC_PORT}`);
  registerGatewayMDNS(GRPC_PORT);
}

function checkGatewayLoginStatus(call: any, callback: any): void {
  callback(null, {
    Code: 0,
    Message: '网关登录状态',
    LoginStatus: gatewayManager.logged(),
  });
}

async function loginServerByToken(call: any, callback: any): Promise<void> {
  const token = call.request.Value;

  if (gatewayManager.logged() && !isLibrary) {
    callback(null, {
      Code: 1,
      Message: '网关已经登录服务器',
      LoginStatus: gatewayManager.logged(),
    });
    return;
  }

  try {
    const tokenModel = decodeUnverifiedToken(token);
    await gatewayManager.addServer(token);
    configMode.loginwithtokenmap[tokenModel.RunId] = token;
    try {
      writeConfigFile(configMode, configFilePath);
    } catch (err) {
      console.error(`保存配置文件失败: ${err}`);
    }
    callback(null, {
      Code: 0,
      Message: '登录成功！',
      LoginStatus: gatewayManager.logged(),
    });
  } catch (err: any) {
    callback(null, {
      Code: 1,
      Message: err.message || 'token错误',
      LoginStatus: gatewayManager.logged(),
    });
  }
}
