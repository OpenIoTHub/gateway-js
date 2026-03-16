import fs from 'fs';
import YAML from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { gatewayManager } from './gatewayManager';
import { autoLoginAndDisplayQRCode } from './autosetup';
import {
  configMode,
  configFilePath,
  setConfigMode,
} from '../config/config';
import { writeConfigFile } from '../config/configFile';
import { setupLogging } from '../config/logging';
import { displayQRCodeById } from '../utils/qr/qrService';
import { decodeUnverifiedToken } from '../models/jwt';
import { GatewayConfig } from '../config/types';

export async function startWithToken(token: string): Promise<void> {
  try {
    await gatewayManager.addServer(token);
    console.log('登录成功！');
  } catch (err) {
    console.error(`登录失败: ${err}，请重新登录`);
  }
}

export async function startWithConfigFile(): Promise<void> {
  console.log('使用的配置文件位置：', configFilePath);

  let content: string;
  try {
    content = fs.readFileSync(configFilePath, 'utf8');
  } catch (err) {
    console.error(`读取配置文件失败: ${err}`);
    return;
  }

  try {
    const parsed = YAML.parse(content) as GatewayConfig;
    setConfigMode({ ...configMode, ...parsed });
  } catch (err) {
    console.error(`解析配置文件失败: ${err}`);
    return;
  }

  if (!configMode.gatewayuuid || configMode.gatewayuuid.length < 35) {
    configMode.gatewayuuid = uuidv4();
    writeConfigFile(configMode, configFilePath);
  }

  if (!configMode.loginwithtokenmap) {
    configMode.loginwithtokenmap = {};
  }

  setupLogging(configMode.logconfig);

  if (Object.keys(configMode.loginwithtokenmap).length === 0) {
    try {
      await autoLoginAndDisplayQRCode();
    } catch (err) {
      console.error(`自动登录失败: ${err}`);
    }
  }

  for (const token of Object.values(configMode.loginwithtokenmap)) {
    try {
      await gatewayManager.addServer(token);
      const tokenModel = decodeUnverifiedToken(token);
      displayQRCodeById(tokenModel.RunId, tokenModel.Host);
    } catch (err) {
      console.error(`添加服务器失败: ${err}`);
    }
  }
}
