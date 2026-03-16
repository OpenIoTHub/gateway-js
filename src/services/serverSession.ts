import { YamuxSession } from '../utils/yamux/yamux';
import { TokenClaims } from '../models/models';
import { loginServer } from '../netservice/services/login/login';
import { handleStream, handleSession } from '../netservice/handle/handle';

export class ServerSession {
  public token: string;
  public tokenModel: TokenClaims;

  private session: YamuxSession | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private quit: boolean = false;
  private checkLock: boolean = false;
  private loginLock: boolean = false;
  private loopLock: boolean = false;

  constructor(token: string, tokenModel: TokenClaims) {
    this.token = token;
    this.tokenModel = tokenModel;
  }

  stop(): void {
    this.quit = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.session && !this.session.isClosed()) {
      this.session.close().catch(() => {});
    }
  }

  async start(): Promise<void> {
    this.quit = false;
    await this.checkSessionStatus();
    this.heartbeatTimer = setInterval(() => {
      if (!this.quit) {
        this.checkSessionStatus().catch((err) => {
          console.error(`心跳检查失败: ${err}`);
        });
      }
    }, 20000);
  }

  private async loginToServer(): Promise<void> {
    if (this.loginLock) return;
    this.loginLock = true;
    try {
      if (this.session && !this.session.isClosed()) {
        return;
      }
      if (this.session) {
        await this.session.close().catch(() => {});
        this.session = null;
      }
      this.session = await loginServer(this.token);
    } finally {
      this.loginLock = false;
    }
  }

  private async loopStream(): Promise<void> {
    if (this.loopLock) return;
    this.loopLock = true;
    try {
      while (true) {
        if (!this.session || this.session.isClosed()) {
          console.log('session is nil or closed');
          break;
        }
        try {
          const stream = await this.session.acceptStream();
          if (!stream) break;
          handleStream(stream, this.token).catch((err) => {
            console.error(`处理流失败: ${err}`);
          });
        } catch (err) {
          console.error(`接受流失败: ${err}`);
          if (this.session) {
            await this.session.close().catch(() => {});
          }
          break;
        }
      }
    } finally {
      this.loopLock = false;
    }
  }

  private async checkSessionStatus(): Promise<void> {
    if (this.checkLock) return;
    this.checkLock = true;
    try {
      if (!this.session || this.session.isClosed()) {
        console.log(`开始(重新)连接: ${this.tokenModel.RunId} @ ${this.tokenModel.Host}`);
        try {
          await this.loginToServer();
        } catch (err) {
          console.error(`检查会话状态时登录失败: ${err}`);
          return;
        }
        this.loopStream().catch((err) => {
          console.error(`循环接受流失败: ${err}`);
        });
      }
    } finally {
      this.checkLock = false;
    }
  }
}
