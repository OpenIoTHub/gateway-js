# Go 版与 JS 版差异对照

本文档详细记录 gateway-go 与 gateway-js 之间的功能和实现差异。

---

## 功能对照表

| 功能模块 | Go 版 | JS 版 | 状态 |
|---------|-------|-------|------|
| TCP 转发 | `conn.JoinTCP` | `joinTCP` | 已实现 |
| STCP (TLS) 转发 | `conn.JoinSTCP` | `joinSTCP` | 已实现 |
| UDP 转发 | `conn.JoinUDP` | `joinUDP` | 已实现 |
| WebSocket 转发 | `conn.JoinWs` | `joinWs` | 已实现 |
| WebSocket TLS 转发 | `conn.JoinWss` | `joinWss` | 已实现 |
| SSH 会话转发 | `conn.JoinSSH` | `joinSSH` | 已实现 |
| 串口转发 | `conn.JoinSerialPort` | `joinSerialPort` | 已实现 |
| mDNS 服务发现 | `mdns.FindAllmDNS` | `findAllmDNS` | 已实现 |
| 端口扫描 | `service.ScanPort` | `scanPort` | 已实现 |
| 系统状态采集 | `service.GetSystemStatus` | `getSystemStatus` | 已实现 |
| IPv6 地址获取 | `service.GetIPv6Addr` | `getIPv6Addr` | 已实现 |
| 组播 UDP | `service.ListenMulticastUDP` | `listenMulticastUDP` | 已实现 |
| 连通性检查 | `service.CheckTcpUdpTlsAsync` | `checkTcpUdpTlsAsync` | 已实现 |
| 子会话嵌套 | `yamux.Server(stream)` | `createServerSession(stream)` | 已实现 |
| 工作连接 | `login.LoginWorkConn` | `loginWorkConn` | 已实现 |
| Docker 服务发现 | `docker.GetContainersServices` | `getContainersServices` | 已实现 |
| HTTP 服务 + QR 码 | `client.startHTTP` | `startHTTP` | 已实现 |
| gRPC 管理服务 | `client.startGRPC` | `startGRPC` | 已实现 |
| mDNS 网关注册 | `client.RegisterGatewayMDNS` | `registerGatewayMDNS` | 已实现 |
| 自动登录绑定 | `autosetup.AutoLoginAndDisplayQRCode` | `autoLoginAndDisplayQRCode` | 已实现 |
| IPv6 P2P 直连 | `tasks.ipv6ClientTask/ServerTask` | `ipv6ClientTask/ServerTask` | 已实现 |
| **TAP 虚拟网卡** | `tapTun.NewTap` | 返回不支持 | **未实现** |
| **TUN 虚拟网卡** | `tapTun.NewTun` | 返回不支持 | **未实现** |
| **P2P/KCP (Server)** | `gateway.MakeP2PSessionAsServer` | 日志 + 关闭 | **未实现** |
| **P2P/KCP (Client)** | `gateway.MakeP2PSessionAsClient` | 日志 + 关闭 | **未实现** |
| **DeleteGatewayJwt** | TODO (未实现) | TODO (未实现) | **两端均未实现** |
| **配置热更新** | 未使用 fsnotify | 未实现 | 两端均未实现 |

---

## 实现差异

### 1. Yamux

- Go：使用 `github.com/libp2p/go-yamux` 第三方库
- JS：自行实现 `YamuxSession` / `YamuxStream`，保持 wire-compatible
- 差异：JS 版 window update 逻辑略有简化，但协议兼容

### 2. 消息序列化

- Go：使用 `reflect.TypeOf(msg).String()` 获取类型字符串（如 `*models.ConnectTCP`）
- JS：使用 `createTypedMessage()` 手动附加 `_typeName` 属性
- 差异：Go 使用指针类型字符串（`*models.XXX`），但 msgio 编码时实际写的是 `models.XXX`（无星号）

### 3. JWT 处理

- Go：使用 `jwt-go` 的 `ParseUnverified`
- JS：手动 base64 解码 payload
- 差异：行为一致（均不校验签名）

### 4. 进程保活

- Go：使用 `select{}` 永久阻塞主 goroutine
- JS：Node.js 事件循环自动保活（HTTP/gRPC/TCP 监听器保持活跃）

### 5. 并发模型

- Go：每个连接一个 goroutine
- JS：基于事件循环的异步 I/O，单线程

### 6. 系统状态

- Go：使用 `shirou/gopsutil` 采集系统信息
- JS：使用 `systeminformation` 包，功能基本等价

### 7. panic 恢复

- Go：`defer recover()` 防止 goroutine panic 导致进程崩溃
- JS：需要 `process.on('uncaughtException')` 和 `process.on('unhandledRejection')` 实现类似效果（当前未添加）

---

## 配置文件兼容性

两个版本共用同一配置文件格式 (`gateway-go.yaml`)：

```yaml
gatewayuuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
loginwithtokenmap:
  "run-id-1": "jwt-token-1"
  "run-id-2": "jwt-token-2"
logconfig:
  enablestdout: true
  logfilepath: ""
```

Go 的 `yaml.v3` 默认将 struct 字段名转为小写，TypeScript 使用 `yaml` 包解析时字段名匹配无问题。
