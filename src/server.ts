// server.ts

import http from 'http';
import { parseJsonBody, isUuid, sendJson } from './utils';
import { User } from './types';
import cluster from 'cluster';

type IPCReq = any;
type IPCRes = any;

const makeIpcCall = (payload: IPCReq): Promise<IPCRes> => {
  return new Promise((resolve, reject) => {
    const cid = `${Date.now()}-${Math.random()}`;
    const handler = (msg: any) => {
      if (!msg || msg.cid !== cid) return;
      process.off('message', handler);
      resolve(msg);
    };
    process.on('message', handler);
    (process as any).send({ ...payload, cid });
    // Optional: add timeout
    setTimeout(() => {
      process.off('message', handler);
      reject(new Error('IPC timeout'));
    }, 5000);
  });
};

const handleNotFound = (res: http.ServerResponse) => {
  sendJson(res, 404, { message: 'Not Found' });
};

const validateUserPayload = (payload: any): { ok: boolean; message?: string } => {
  if (!payload || typeof payload !== 'object') return { ok: false, message: 'Invalid body' };
  const { username, age, hobbies } = payload;
  if (typeof username !== 'string' || username.trim() === '') return { ok: false, message: 'username is required and must be string' };
  if (typeof age !== 'number') return { ok: false, message: 'age is required and must be number' };
  if (!Array.isArray(hobbies)) return { ok: false, message: 'hobbies must be array' };
  if (!hobbies.every(h => typeof h === 'string')) return { ok: false, message: 'hobbies must be array of strings' };
  return { ok: true };
};

export const createServer = (port: number) => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url ?? '/';
      const method = req.method ?? 'GET';
      // Basic routing
      if (url === '/api/users' && method === 'GET') {
        const reply = await makeIpcCall({ op: 'getAll' });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        return sendJson(res, 200, reply.result);
      }

      if (url && url.startsWith('/api/users/') && method === 'GET') {
        const id = url.slice('/api/users/'.length);
        if (!isUuid(id)) return sendJson(res, 400, { message: 'Invalid userId' });
        const reply = await makeIpcCall({ op: 'get', id });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        return sendJson(res, 200, reply.result);
      }

      if (url === '/api/users' && method === 'POST') {
        const body = await parseJsonBody(req);
        const valid = validateUserPayload(body);
        if (!valid.ok) return sendJson(res, 400, { message: valid.message });
        const reply = await makeIpcCall({ op: 'create', payload: body });
        if (!reply.ok) return sendJson(res, 500, { message: reply.error });
        return sendJson(res, 201, reply.result);
      }

      if (url && url.startsWith('/api/users/') && method === 'PUT') {
        const id = url.slice('/api/users/'.length);
        if (!isUuid(id)) return sendJson(res, 400, { message: 'Invalid userId' });
        const body = await parseJsonBody(req);
        const valid = validateUserPayload({ ...body, hobbies: body?.hobbies ?? [] });
        if (!valid.ok) return sendJson(res, 400, { message: valid.message });
        const reply = await makeIpcCall({ op: 'update', id, payload: body });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        return sendJson(res, 200, reply.result);
      }

      if (url && url.startsWith('/api/users/') && method === 'DELETE') {
        const id = url.slice('/api/users/'.length);
        if (!isUuid(id)) return sendJson(res, 400, { message: 'Invalid userId' });
        const reply = await makeIpcCall({ op: 'delete', id });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        // 204 no content
        res.writeHead(204);
        return res.end();
      }

      // non-existing endpoint
      return handleNotFound(res);
    } catch (err: any) {
      sendJson(res, 500, { message: 'Internal Server Error' });
    }
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Worker PID ${process.pid} listening on ${port}`);
  });

  return server;
};
