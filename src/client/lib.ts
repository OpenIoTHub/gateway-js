import { runTasks } from '../tasks/tasks';
import { startHTTP } from './http';
import { startGRPC } from './grpc';

export let isLibrary = true;

export function setIsLibrary(val: boolean): void {
  isLibrary = val;
}

export function run(): void {
  start().catch((err) => {
    console.error(`gateway-js panic: ${err}`);
  });
}

async function start(): Promise<void> {
  runTasks();
  startHTTP();
  startGRPC();
}
