#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import { run, setIsLibrary } from './client/lib';
import {
  configFilePath,
  setConfigFilePath,
  setGatewayLoginToken,
} from './config/config';
import { initConfigFile } from './config/configFile';
import { buildVersion, printLogo } from './info/info';
import { startWithToken, startWithConfigFile } from './services/startup';

const version = '';
const commit = '';
const date = '';
const builtBy = '';

async function main() {
  setIsLibrary(false);

  const program = new Command();

  program
    .name('gateway-js')
    .description('OpenIoTHub Gateway - TypeScript/Node.js version')
    .version(buildVersion(version, commit, date, builtBy))
    .option('-c, --config <path>', 'config file path', configFilePath)
    .option('-t, --token <token>', 'login server by gateway token', '');

  program
    .command('init')
    .alias('i')
    .description('init config file')
    .option('-c, --config <path>', 'config file path', configFilePath)
    .action((opts) => {
      if (opts.config) setConfigFilePath(opts.config);
      initConfigFile();
    });

  program
    .command('test')
    .alias('t')
    .description('test this command')
    .action(() => {
      console.log('ok');
    });

  program.action(async (opts) => {
    if (opts.config) setConfigFilePath(opts.config);
    if (opts.token) setGatewayLoginToken(opts.token);

    // Check for environment variables
    const envConfig = process.env.GatewayConfigFilePath;
    if (envConfig) setConfigFilePath(envConfig);
    const envToken = process.env.GatewayLoginToken;
    if (envToken) setGatewayLoginToken(envToken);

    printLogo();

    const currentToken = opts.token || envToken || '';
    if (currentToken) {
      await startWithToken(currentToken);
    } else {
      const cfgPath = opts.config || envConfig || configFilePath;
      if (!fs.existsSync(cfgPath)) {
        initConfigFile();
      }
      await startWithConfigFile();
    }

    run();
    // Keep process alive
  });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
