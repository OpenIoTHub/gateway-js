# gateway-js

[OpenIoTHub](https://github.com/OpenIoTHub) 网关的 TypeScript / Node.js 版本，是 [gateway-go](https://github.com/OpenIoTHub/gateway-go) 的完整重写，与 Go 版本保持线协议兼容。

---

## 功能特性

- JWT Token 登录 OpenIoTHub 服务器
- 首次运行自动获取 Token 并展示二维码供手机扫码绑定
- 多协议端口转发：TCP / TLS / UDP / WebSocket / WSS / SSH / 串口
- mDNS 服务发现与网关注册
- TCP 端口扫描
- 组播 UDP 监听转发
- 系统状态信息采集（CPU、内存、磁盘、网络）
- IPv6 P2P 直连
- HTTP 管理界面与二维码展示
- gRPC 管理服务（登录状态查询 / Token 登录）
- Docker 容器服务发现
- yamux 多路复用（与 Go 版本 wire-compatible）

---

## 环境要求

- **Node.js** >= 18
- **npm** >= 8
- 串口功能需要系统编译工具链（`node-gyp`）

---

## 快速开始

### 安装依赖

```bash
cd gateway-js
npm install
```

### 编译

```bash
npm run build
```

编译产物在 `dist/` 目录，proto 文件会自动复制到 `dist/proto/`。

### 运行

```bash
# 默认启动（使用配置文件，首次运行自动创建并自动登录）
npm start

# 使用 Token 登录
npm start -- -t <your-gateway-token>

# 指定配置文件路径
npm start -- -c /path/to/gateway-go.yaml

# 初始化配置文件（不启动服务）
npm start -- init

# 开发模式（ts-node 直接运行，无需编译）
npm run dev
```

### 全局安装

```bash
npm run build
npm link

# 之后可以直接使用命令
gateway-js
gateway-js -t <your-gateway-token>
gateway-js init
gateway-js --help
```

---

## 命令行参数

```
Usage: gateway-js [options] [command]

OpenIoTHub Gateway - TypeScript/Node.js version

Options:
  -V, --version          查看版本号
  -c, --config <path>    配置文件路径（默认: ./gateway-go.yaml）
  -t, --token <token>    使用 Gateway Token 直接登录服务器
  -h, --help             查看帮助

Commands:
  init|i                 初始化配置文件
  test|t                 测试命令是否可用
```

---

## 配置文件

默认配置文件名为 `gateway-go.yaml`（与 Go 版共用同一格式），首次运行时自动创建。

```yaml
# 网关唯一标识，自动生成
gatewayuuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 日志配置
logconfig:
  enablestdout: true       # 是否输出到终端
  logfilepath: ""          # 日志文件路径（空则不写文件）

# HTTP 服务端口
http_service_port: 34323

# 已登录的 Token 列表（RunId -> JWT Token）
loginwithtokenmap: {}
```

### 配置说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `gatewayuuid` | string | 网关 UUID，自动生成，长度不足 35 位时会重新生成 |
| `logconfig.enablestdout` | boolean | 是否将日志输出到终端 |
| `logconfig.logfilepath` | string | 日志文件路径，为空则不写文件 |
| `http_service_port` | number | HTTP 管理界面端口，默认 `34323` |
| `loginwithtokenmap` | object | 已登录服务器的 Token 映射，键为 RunId，值为 JWT Token |

---

## 环境变量

| 变量名 | 说明 |
|--------|------|
| `GatewayLoginToken` | 直接指定登录 Token（优先级高于配置文件） |
| `GatewayConfigFilePath` | 指定配置文件路径 |
| `SNAP_USER_DATA` | Snap 应用数据目录（自动拼接配置文件路径） |

示例：

```bash
# 通过环境变量启动
GatewayLoginToken=eyJhbGci... node dist/main.js

# 指定配置文件
GatewayConfigFilePath=/etc/gateway/gateway-go.yaml node dist/main.js
```

---

## Docker 部署

### 构建镜像

```bash
docker build -t gateway-js .
```

### 运行容器

```bash
# 基本运行（自动登录模式）
docker run -d \
  --name gateway-js \
  -p 34323:34323 \
  -p 55443:55443 \
  gateway-js

# 使用 Token 登录
docker run -d \
  --name gateway-js \
  -p 34323:34323 \
  -p 55443:55443 \
  gateway-js -t <your-gateway-token>

# 挂载配置文件持久化
docker run -d \
  --name gateway-js \
  -p 34323:34323 \
  -p 55443:55443 \
  -v /path/to/config:/app/gateway-go.yaml \
  gateway-js

# 启用 Docker 容器服务发现（需要挂载 docker.sock）
docker run -d \
  --name gateway-js \
  -p 34323:34323 \
  -p 55443:55443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  gateway-js
```

### 端口说明

| 端口 | 协议 | 说明 |
|------|------|------|
| `34323` | HTTP | 管理界面与二维码展示 |
| `55443` | gRPC | 网关管理服务（登录状态查询 / Token 登录） |

---

## 服务接口

### HTTP 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 管理首页（显示登录状态与 QR 码链接） |
| `/DisplayQrHandler` | GET | 返回二维码图片（PNG），供手机扫码绑定网关 |

### gRPC 接口

服务定义见 `src/proto/gateway.proto`：

| 方法 | 说明 |
|------|------|
| `CheckGatewayLoginStatus` | 查询网关登录状态 |
| `LoginServerByToken` | 通过 Token 登录服务器 |

---

## 协议兼容性

TypeScript 版与 Go 版使用完全相同的线上协议，可以互相替换：

| 协议层 | 说明 |
|--------|------|
| **yamux** | 流多路复用，与 `libp2p/go-yamux` wire-compatible |
| **msgio** | 消息帧格式：4 字节大端长度前缀 + 载荷 |
| **消息格式** | 两帧组成：`[len][type_string]` + `[len][json_body]` |
| **类型标识** | Go 反射类型字符串，如 `models.ConnectTCP` |

---

## 项目结构

```
gateway-js/
├── src/                        # TypeScript 源码
│   ├── main.ts                 # CLI 入口
│   ├── config/                 # 配置管理
│   ├── models/                 # 协议消息定义
│   ├── utils/                  # 工具层（yamux, msgio, io, qr, docker）
│   ├── services/               # 业务层（会话管理, HTTP 处理, 自动登录）
│   ├── netservice/             # 网络服务层（消息分发, 连接转发, 服务处理）
│   ├── tasks/                  # 后台任务（IPv6 P2P）
│   ├── client/                 # 客户端服务（HTTP, gRPC, mDNS）
│   ├── register/               # 本地服务注册
│   └── proto/                  # gRPC Proto 文件
├── docs/                       # 详细文档
│   ├── architecture.md         # 架构说明
│   ├── go-js-diff.md           # Go/JS 差异对照
│   ├── unimplemented-features.md # 未实现功能
│   └── optimization-suggestions.md # 优化建议
├── package.json
├── tsconfig.json
├── Dockerfile
└── gateway-go.yaml             # 默认配置文件
```

详细架构说明见 [docs/architecture.md](docs/architecture.md)。

---

## 作为库使用

gateway-js 支持以库的形式嵌入其他 Node.js 项目：

```typescript
import { gatewayManager } from 'gateway-js/dist/services/gatewayManager';
import { run } from 'gateway-js/dist/client/lib';

// 添加服务器
await gatewayManager.addServer('your-jwt-token');

// 启动后台服务（HTTP, gRPC, IPv6 任务）
run();
```

---

## License

MIT
