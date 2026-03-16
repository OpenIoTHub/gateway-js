import { EventEmitter } from 'events';
import { Ipv6ClientHandleTask } from '../models/chansData';

class TaskChannel extends EventEmitter {
  private queue: Ipv6ClientHandleTask[] = [];

  send(task: Ipv6ClientHandleTask): void {
    this.queue.push(task);
    this.emit('task');
  }

  async receive(): Promise<Ipv6ClientHandleTask> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    return new Promise((resolve) => {
      const handler = () => {
        if (this.queue.length > 0) {
          this.removeListener('task', handler);
          resolve(this.queue.shift()!);
        }
      };
      this.on('task', handler);
    });
  }
}

export const clientTaskChan = new TaskChannel();
