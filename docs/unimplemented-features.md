# 未实现功能清单

本文档记录 gateway-js 中尚未实现的功能，以及与 Go 版本 (`gateway-go`) 之间的差异。

---

## 1. P2P / KCP 连接

**优先级**：高  
**涉及文件**：`src/netservice/handle/handle.ts` (行 106-127)

Go 版通过 `github.com/OpenIoTHub/utils/v2/net/p2p/gateway` 实现了基于 KCP 协议的 P2P 打洞连接，包括：

- `ReqNewP2PCtrlAsServer`：作为 listener 方式从 UDP 洞中获取 KCP 连接
- `ReqNewP2PCtrlAsClient`：作为 dial 方式创建 KCP 连接

当前 JS 版仅打印日志并关闭连接：

```typescript
case 'models.ReqNewP2PCtrlAsServer':
  console.log('P2P server session not yet implemented in JS version');
  stream.destroy();
  break;
```

**实现建议**：

- 调研 Node.js 的 KCP 实现（如 `node-kcp` 或自行基于 UDP 实现）
- 需要实现 UDP 打洞协商（STUN/TURN 或自定义协议）
- 在打洞成功后建立 yamux session 进行复用

---

## 2. TAP/TUN 虚拟网卡

**优先级**：中  
**涉及文件**：`src/netservice/services/connect/service/serviceHdl.ts` (行 12-22)

Go 版通过 `water` 库实现 TAP/TUN 虚拟网卡，支持 darwin、linux、windows、freebsd 平台。当前 JS 版返回"不支持"响应。

**实现建议**：

- Node.js 没有成熟的跨平台 TAP/TUN 库
- 可考虑通过 N-API addon 封装 `water` 库
- 或者使用 `child_process` 调用系统命令（`ip tuntap`、`ifconfig`）创建接口，再通过 fd 读写

---

## 3. DeleteGatewayJwt 处理

**优先级**：低（Go 版同样未实现）  
**涉及文件**：`src/netservice/handle/handle.ts` (行 143-146)

当服务器端用户删除了该网关时，服务器会发送 `DeleteGatewayJwt` 消息通知网关清除本地保存的 JWT token，以允许新用户重新绑定。

**实现建议**：

```typescript
case 'models.DeleteGatewayJwt':
  // 1. 从 configMode.loginwithtokenmap 中删除对应 token
  // 2. 调用 gatewayManager.delServer(runId) 断开会话
  // 3. 写回配置文件
  // 4. 关闭 stream
  stream.destroy();
  break;
```

---

## 4. IPv6 直连 Token 验证

**优先级**：中（Go 版同样未实现）  
**涉及文件**：`src/tasks/ipv6ClientServer.ts` (行 63)

IPv6 P2P 直连（`ipv6ClientHandle`）中收到的消息未做 token 和 RunId 验证，`handleSession` 传入空字符串 token。这意味着任何能连接到 IPv6 监听端口的客户端都可以直接使用网关服务。

**实现建议**：

- 解析收到的消息中的 token 字段
- 调用 `decodeUnverifiedToken` 验证 token 有效性
- 将验证后的 token 传给 `handleSession`

---

## 5. 全局异常处理

**优先级**：中  
**涉及文件**：`src/main.ts`

Go 版在 `HandleStream`、`HandleSession`、`lib.go` 等关键位置使用 `defer recover()` 防止 panic 导致进程崩溃。JS 版缺少全局未捕获异常处理。

**实现建议**：

在 `main.ts` 入口添加：

```typescript
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise rejection:', reason);
});
```

---

## 6. 构建时版本注入

**优先级**：低  
**涉及文件**：`src/main.ts` (行 15-18)

`version`、`commit`、`date`、`builtBy` 目前均为空字符串，Go 版通过 `ldflags` 在编译时注入。

**实现建议**：

- 使用环境变量或 `package.json` 的 version 字段
- 构建脚本中通过 `git describe --tags` 获取版本信息
- 生成 `src/info/buildInfo.ts` 文件注入值
