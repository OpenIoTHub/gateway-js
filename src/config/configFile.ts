import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { GatewayConfig } from './types';
import { configFilePath, configMode } from './config';

export function writeConfigFile(cfg: GatewayConfig, filePath: string): void {
  const content = YAML.stringify(cfg);
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o644 });
}

export function initConfigFile(): void {
  const dir = path.dirname(configFilePath);
  if (dir !== '.' && dir !== '') {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`创建配置目录失败: ${err}`);
      return;
    }
  }
  try {
    writeConfigFile(configMode, configFilePath);
    console.log('config created');
  } catch (err) {
    console.error('写入配置文件模板出错，请检查本程序是否具有写入权限！或者手动创建配置文件。');
    console.error(err);
  }
}
