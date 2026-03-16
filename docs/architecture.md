# 架构说明

本文档描述 gateway-js 的整体架构和模块职责。

---

## 目录结构

```
gateway-js/src/
├── main.ts                    # CLI 入口，命令行解析
├── info/
│   └── info.ts                # 版本信息与 Logo 打印
├── config/
│   ├── config.ts              # 全局配置常量与运行时状态
│   ├── types.ts               # 配置类型定义 (GatewayConfig, LogConfig)
│   ├── configFile.ts          # YAML 配置文件读写
│   └── logging.ts             # 日志输出设置
├── models/
│   ├── models.ts              # 协议消息接口与类型映射表
│   ├── chansData.ts           # IPv6 任务数据接口
│   └── jwt.ts                 # JWT 解码
├── chans/
│   └── chans.ts               # 异步任务通道 (TaskChannel)
├── utils/
│   ├── msg/
│   │   └── process.ts         # 消息序列化/反序列化 (msgio 协议)
│   ├── yamux/
│   │   └── yamux.ts           # Yamux 流复用 (wire-compatible with go-yamux)
│   ├── io/
│   │   └── join.ts            # 双向流桥接
│   ├── qr/
│   │   └── qrService.ts       # QR 码生成与终端显示
│   └── docker/
│       └── docker.ts          # Docker 容器服务发现
├── services/
│   ├── startup.ts             # 启动编排 (配置加载 → 登录 → QR 显示)
│   ├── gatewayManager.ts      # 网关控制器 (管理多个 ServerSession)
│   ├── serverSession.ts       # 单服务器会话 (连接、心跳、重连)
│   ├── httpHandler.ts         # HTTP 路由处理器
│   └── autosetup.ts           # 自动登录与 QR 码绑定
├── netservice/
│   ├── handle/
│   │   └── handle.ts          # 流消息分发器 (消息类型 → 处理函数)
│   └── services/
│       ├── login/
│       │   └── login.ts       # 服务器登录 (TCP + msgio + yamux)
│       └── connect/
│           ├── conn/
│           │   ├── tcp.ts     # TCP/STCP 转发
│           │   ├── udp.ts     # UDP 转发
│           │   ├── ws.ts      # WebSocket/WSS 转发
│           │   ├── ssh.ts     # SSH 会话转发
│           │   └── serialPort.ts  # 串口转发
│           └── service/
│               ├── serviceHdl.ts      # 服务类型分发
│               ├── check.ts           # TCP/UDP/TLS 连通性检查
│               ├── scanPort.ts        # 端口扫描
│               ├── getIPv6Addr.ts     # IPv6 地址获取
│               ├── listenMulticastUDP.ts  # 组播 UDP 监听
│               ├── systemStatus.ts    # 系统状态采集
│               └── mdns/
│                   ├── enter.ts       # mDNS 管理器
│                   └── mdns.ts        # mDNS 服务发现
├── tasks/
│   ├── tasks.ts               # 后台任务入口
│   └── ipv6ClientServer.ts    # IPv6 P2P 直连
├── client/
│   ├── lib.ts                 # 后台服务启动编排
│   ├── http.ts                # Express HTTP 服务
│   ├── grpc.ts                # gRPC 服务
│   └── mdns.ts                # mDNS 网关注册
├── register/
│   └── registerService.ts     # 本地服务注册表
└── proto/
    ├── gateway.proto           # gRPC 网关管理服务定义
    └── publicApi.proto         # gRPC 公共 API 定义
```

---

## 核心流程

### 启动流程

```
main.ts
  ├─ 解析命令行参数
  ├─ 使用 token 启动？
  │   └─ startWithToken() → gatewayManager.addServer()
  └─ 使用配置文件启动？
      └─ startWithConfigFile()
          ├─ 读取 YAML 配置
          ├─ 生成/校验 gatewayuuid
          ├─ 设置日志
          ├─ 无 token → autoLoginAndDisplayQRCode()
          └─ 遍历 token → gatewayManager.addServer()
  run()
    ├─ runTasks() → ipv6ServerTask() + ipv6ClientTask()
    ├─ startHTTP() → Express 监听
    └─ startGRPC() → gRPC 监听 + mDNS 注册
```

### 连接流程

```
ServerSession.start()
  ├─ checkSessionStatus() (每 20s 心跳)
  │   └─ loginToServer()
  │       ├─ TCP 连接到 token.Host:token.TcpPort
  │       ├─ 发送 GatewayLogin 消息
  │       └─ 创建 yamux Server session
  └─ loopStream()
      └─ acceptStream() → handleStream()
          ├─ readMsg() 读取消息类型
          └─ switch(type) 分发到具体处理器
              ├─ ConnectTCP/STCP → joinTCP/joinSTCP
              ├─ ConnectUDP → joinUDP
              ├─ ConnectWs/Wss → joinWs/joinWss
              ├─ ConnectSSH → joinSSH
              ├─ ConnectSerialPort → joinSerialPort
              ├─ NewService → serviceHdl (mDNS/扫描/状态/IPv6等)
              ├─ NewSubSession → 嵌套 yamux session
              ├─ Ping → Pong 响应
              ├─ CheckStatusRequest → 连通性检查
              └─ RequestNewWorkConn → 新工作连接
```

### 协议栈

```
┌────────────────────────┐
│     应用层消息           │  ConnectTCP, NewService, Ping...
├────────────────────────┤
│     msgio 帧            │  4字节大端长度 + 载荷
│     (类型帧 + 数据帧)    │  [len][type_string][len][json_body]
├────────────────────────┤
│     yamux 复用          │  多路流复用 (12字节头 + 数据)
├────────────────────────┤
│     TCP                 │  传输层
└────────────────────────┘
```

---

## 与 Go 版对应关系

| Go 包/库 | JS 对应 |
|----------|---------|
| `github.com/libp2p/go-yamux` | `src/utils/yamux/yamux.ts` (自行实现，wire-compatible) |
| `github.com/libp2p/go-msgio` | `src/utils/msg/process.ts` (自行实现) |
| `github.com/OpenIoTHub/utils/v2/io.Join` | `src/utils/io/join.ts` |
| `net/http` | Express |
| `google.golang.org/grpc` | `@grpc/grpc-js` |
| `github.com/grandcat/zeroconf` | `bonjour-service` |
| `github.com/fsnotify/fsnotify` | 暂无（配置热更新未实现） |
| `github.com/songgao/water` | 未实现（TAP/TUN） |
| `github.com/OpenIoTHub/utils/v2/net/p2p` | 未实现（P2P/KCP） |
