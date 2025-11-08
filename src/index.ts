// index.ts
import dotenv from 'dotenv';
dotenv.config();
import cluster from 'cluster';
import { cpus } from 'os';
import { createServer } from './server';
import { User } from './types';

const PORT = Number(process.env.PORT ?? 4000);

if (cluster.isPrimary) {
  const numCPUs = cpus().length;
  const users: Record<string, User> = {};

  // обработка сообщений от воркеров
  cluster.on('message', (worker, msg: any) => {
    if (!msg.op) return;
    const { cid, op, id, payload } = msg;
    try {
      if (op === 'getAll') {
        worker.send({ cid, ok: true, result: Object.values(users) });
      } else if (op === 'get') {
        if (!users[id]) return worker.send({ cid, ok: false, status: 404, error: 'User not found' });
        worker.send({ cid, ok: true, result: users[id] });
      } else if (op === 'create') {
        const uuid = crypto.randomUUID();
        users[uuid] = { id: uuid, ...payload };
        worker.send({ cid, ok: true, result: users[uuid] });
      } else if (op === 'update') {
        if (!users[id]) return worker.send({ cid, ok: false, status: 404, error: 'User not found' });
        users[id] = { ...users[id], ...payload };
        worker.send({ cid, ok: true, result: users[id] });
      } else if (op === 'delete') {
        if (!users[id]) return worker.send({ cid, ok: false, status: 404, error: 'User not found' });
        delete users[id];
        worker.send({ cid, ok: true });
      }
    } catch (err) {
      worker.send({ cid, ok: false, error: String(err) });
    }
  });

  // создаём воркеров
  for (let i = 0; i < Math.min(2, numCPUs); i++) {
    cluster.fork();
  }

} else {
  createServer(PORT);
}
