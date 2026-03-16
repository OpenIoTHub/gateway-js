import { ipv6ServerTask, ipv6ClientTask } from './ipv6ClientServer';

export function runTasks(): void {
  ipv6ServerTask();
  ipv6ClientTask();
}
