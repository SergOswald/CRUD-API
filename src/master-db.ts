import { User } from './types';
import { v4 as uuidv4 } from 'uuid';
import cluster from 'cluster';

type IPCRequest =
  | { cid: string; op: 'getAll' }
  | { cid: string; op: 'get'; id: string }
  | { cid: string; op: 'create'; payload: Omit<User,'id'> }
  | { cid: string; op: 'update'; id: string; payload: Partial<Omit<User,'id'>> }
  | { cid: string; op: 'delete'; id: string };

type IPCResponse = { cid: string; ok: true; result?: unknown } | { cid: string; ok: false; error: string; status?: number };

const users: Map<string, User> = new Map();

export const handleMasterMessage = (msg: IPCRequest, worker: cluster.Worker) => {
  const cid = msg.cid;
  try {
    switch (msg.op) {
      case 'getAll':
        worker.send({ cid, ok: true, result: Array.from(users.values()) } as IPCResponse);
        return;
      case 'get':
        {
          const u = users.get(msg.id);
          if (!u) { worker.send({ cid, ok: false, error: 'User not found', status: 404 }); return; }
          worker.send({ cid, ok: true, result: u });
          return;
        }
      case 'create':
        {
          const id = uuidv4();
          const newUser: User = { id, username: msg.payload.username, age: msg.payload.age, hobbies: msg.payload.hobbies ?? [] };
          users.set(id, newUser);
          worker.send({ cid, ok: true, result: newUser });
          return;
        }
      case 'update':
        {
          const u = users.get(msg.id);
          if (!u) { worker.send({ cid, ok: false, error: 'User not found', status: 404 }); return; }
          const updated: User = { ...u, ...msg.payload };
          users.set(msg.id, updated);
          worker.send({ cid, ok: true, result: updated });
          return;
        }
      case 'delete':
        {
          const existed = users.delete(msg.id);
          if (!existed) { worker.send({ cid, ok: false, error: 'User not found', status: 404 }); return; }
          worker.send({ cid, ok: true, result: null });
          return;
        }
      default:
        worker.send({ cid, ok: false, error: 'Unknown op' });
    }
  } catch (err: any) {
    worker.send({ cid, ok: false, error: 'Internal error' });
  }
};
