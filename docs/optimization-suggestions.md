# 优化建议

本文档记录 gateway-js 中可进一步优化的方面，包括性能、安全、错误处理和代码质量。

---

## 一、性能优化

### 1.1 Yamux Buffer 分配

**涉及文件**：`src/utils/yamux/yamux.ts`

频繁使用 `Buffer.concat()` 进行数据拼接（行 101, 111, 270, 398），每次拼接都会创建新的 Buffer 并拷贝数据。

**建议**：

- 使用 `BufferList`（如 `bl` 包）减少内存拷贝
- 或预分配固定大小的环形缓冲区，减少 GC 压力

### 1.2 readExactBytes 内存分配

**涉及文件**：`src/utils/msg/process.ts` (行 8-61)

每次读取消息都通过 `Buffer.concat(chunks, size)` 创建新 Buffer。高吞吐场景下会产生大量短命 Buffer 对象。

**建议**：

- 对于固定大小的读取（如 4 字节长度头），复用 Buffer
- 考虑 Buffer 池（pool）方案

### 1.3 端口扫描并发控制

**涉及文件**：`src/netservice/services/connect/service/scanPort.ts` (行 16-50)

当前固定 `CONCURRENCY = 100`，对资源受限设备（如嵌入式网关）可能过高。

**建议**：

- 使并发数可配置
- 根据系统 `ulimit -n` 动态调整
- 考虑使用 `p-limit` 等限流库

### 1.4 UDP Socket 复用

**涉及文件**：`src/netservice/services/connect/conn/udp.ts`

每个 UDP 转发连接创建一个新的 `dgram.Socket`。如果同一目标有多个转发，可以考虑复用。

**建议**：

- 对相同目标地址的 UDP 连接复用 socket
- 引入连接池机制

### 1.5 handleSession 流并发限制

**涉及文件**：`src/netservice/handle/handle.ts` (行 159-172)，`src/services/serverSession.ts`

`handleSession` 和 `loopStream` 中 `acceptStream` 后立即异步处理，没有并发上限。恶意服务器可以发送大量流导致资源耗尽。

**建议**：

- 添加最大并发流数限制（如 256）
- 超过限制时暂停 `acceptStream` 或拒绝新流

---

## 二、安全优化

### 2.1 JWT 签名验证

**涉及文件**：`src/models/jwt.ts`

全局使用 `decodeUnverifiedToken`（不校验签名），`decodeToken`（带签名校验）已实现但从未被调用。这与 Go 版行为一致（Go 版也不校验），但从安全角度应改进。

**建议**：

- 在与服务器建立连接后，由服务器下发公钥或密钥
- 对关键操作（如 `loginServerByToken`）使用签名验证

### 2.2 TLS 连接超时

**涉及文件**：
- `src/netservice/services/connect/conn/tcp.ts` (行 18-24)：`joinSTCP` 无超时
- `src/netservice/services/connect/service/check.ts` (行 54-63)：TLS 检查无超时

**建议**：

```typescript
// joinSTCP 加入超时
const sock = tls.connect({ host: ip, port }, () => resolve(sock));
sock.setTimeout(30000, () => {
  sock.destroy(new Error('TLS connection timeout'));
});
sock.on('error', reject);
```

### 2.3 输入校验

**涉及文件**：`src/netservice/handle/handle.ts` (行 42-81)

从服务器收到的 `TargetIP`、`TargetPort`、`TargetUrl`、`PortName` 等字段直接用于建立连接，未做任何校验。虽然连接来自可信服务器，但中间人攻击或服务器漏洞可能导致被利用进行 SSRF。

**建议**：

- 校验 IP 地址格式（使用 `net.isIP()`）
- 校验端口范围（1-65535）
- 校验 URL 格式（使用 `new URL()` 验证）
- 可选：配置白名单限制可连接的目标

### 2.4 gRPC 监听安全

**涉及文件**：`src/client/grpc.ts` (行 43-44)

gRPC 使用 `createInsecure()` 监听，虽然是本地服务，但在共享主机环境中可能被其他进程访问。

**建议**：

- 绑定到 `127.0.0.1` 而非 `0.0.0.0`（除非需要外部访问）
- 考虑添加简单认证机制

---

## 三、错误处理优化

### 3.1 静默 catch 块

以下位置的空 `catch` 块可以添加调试级别日志：

| 文件 | 行号 | 场景 |
|------|------|------|
| `src/register/registerService.ts` | 42 | Docker 服务发现失败 |
| `src/client/mdns.ts` | 27 | 获取登录信息失败 |
| `src/utils/docker/docker.ts` | 27-29, 60-62 | Docker 连接或容器查询失败 |
| `src/utils/yamux/yamux.ts` | 多处 | session 关闭/流清理错误 |
| `src/services/serverSession.ts` | 29, 53 | session close 错误 |

**建议**：

```typescript
// 替换 catch {} 为
catch (err) {
  // Docker 不可用时正常，仅记录调试信息
  console.debug?.(`Docker 服务发现失败: ${err}`);
}
```

### 3.2 loginServerByToken 配置回滚

**涉及文件**：`src/client/grpc.ts` (行 86-105)

`loginServerByToken` 在 `addServer` 成功后写入配置。若后续 `writeConfigFile` 成功但 server session 实际断开，已写入的 token 将在下次启动时导致重试。这是预期行为，但如果 `addServer` 抛异常，而 `configMode.loginwithtokenmap` 可能已被修改（如果修改在 try 块外部）。

当前代码中修改在 `addServer` 成功之后，逻辑正确。无需改动。

### 3.3 systemStatus 错误信息

**涉及文件**：`src/netservice/services/connect/service/systemStatus.ts`

`systeminformation` 调用失败时使用 `.catch(() => null)` 丢弃错误信息，导致运维排查困难。

**建议**：

```typescript
const cpuInfo = await si.cpu().catch((err) => {
  console.debug?.(`获取 CPU 信息失败: ${err}`);
  return null;
});
```

---

## 四、代码质量

### 4.1 配置文件名

**涉及文件**：`src/config/config.ts` (行 5)

配置文件名为 `gateway-go.yaml`。这是为了与 Go 版共用同一配置文件，属于有意设计。若需独立部署，可改为 `gateway-js.yaml`。

### 4.2 mDNS 注册文本

**涉及文件**：`src/client/http.ts` (行 20-21)

mDNS 注册文本中 `home-page` 指向 `gateway-go` 仓库：

```
'home-page=https://github.com/OpenIoTHub/gateway-go'
```

可更新为 gateway-js 对应的仓库地址（如有独立仓库）。

同样，`src/client/mdns.ts` (行 48) 中的 `firmware-respository` 也指向 Go 版。

### 4.3 joinWss 实现

**涉及文件**：`src/netservice/services/connect/conn/ws.ts`

`joinWss` 直接调用 `joinWs`，依赖传入 URL 为 `wss://` 前缀来走 TLS。这在功能上正确（`ws` 库会根据协议自动选择），但函数名和参数可能造成误解。

**建议**：添加注释说明此设计意图。

### 4.4 依赖瘦身

| 依赖 | 说明 |
|------|------|
| `systeminformation` | 约 1.5MB，若仅需 CPU/内存/磁盘/网络基础信息，可用 `os` 模块 + `child_process` 替代大部分功能 |
| `serialport` | 原生模块，安装需要编译工具链。若目标平台不需要串口功能，可设为 `optionalDependencies` |
| `dockerode` | 若目标平台不需要 Docker 服务发现，可设为 `optionalDependencies` |
| `@grpc/proto-loader` | 可考虑预编译 proto 为 TypeScript 代码，去掉运行时 proto 加载 |
