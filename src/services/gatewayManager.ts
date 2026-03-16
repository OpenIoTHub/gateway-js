import { decodeUnverifiedToken } from '../models/jwt';
import { TokenClaims } from '../models/models';
import { ServerSession } from './serverSession';

export class GatewayCtl {
  private serverSessions: Map<string, ServerSession> = new Map();

  logged(): boolean {
    return this.serverSessions.size > 0;
  }

  async addServer(token: string): Promise<void> {
    const tokenModel = decodeUnverifiedToken(token);
    if (this.serverSessions.has(tokenModel.RunId)) {
      throw new Error(`runId ${tokenModel.RunId} already exists`);
    }
    const ss = new ServerSession(token, tokenModel);
    this.serverSessions.set(tokenModel.RunId, ss);
    await ss.start();
  }

  delServer(runId: string): void {
    const session = this.serverSessions.get(runId);
    if (!session) {
      throw new Error(`gateway uuid: ${runId} not found`);
    }
    session.stop();
    this.serverSessions.delete(runId);
  }

  getLoginInfo(): { gatewayUUID: string; serverHost: string } {
    if (this.serverSessions.size === 0) {
      throw new Error('not logged in');
    }
    for (const [key, sess] of this.serverSessions) {
      return { gatewayUUID: key, serverHost: sess.tokenModel.Host };
    }
    throw new Error('no active session found');
  }
}

export const gatewayManager = new GatewayCtl();
