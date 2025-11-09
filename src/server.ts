// server.ts
//отвечает за работу каждого воркера
//обрабатывает HTTP-запросы (GET, POST, PUT, DELETE) и общается с главным процессом (master), 
//где хранится база данных пользователей.

import http from 'http';
import { parseJsonBody, isUuid, sendJson } from './utils';
//parseJsonBody — утилита для чтения тела запроса (например, из POST/PUT)
//isUuid — проверка, что строка — это корректный UUID
//отправка JSON-ответа с нужным статусом
import { User } from './types';
import cluster from 'cluster';

type IPCReq = any;
type IPCRes = any;
//функция, с помощью которой воркер “спрашивает” у мастера данные 
//ли просит выполнить операцию (например, “создай пользователя”)
//Она возвращает Promise, который разрешается, когда мастер пришлёт ответ
const makeIpcCall = (payload: IPCReq): Promise<IPCRes> => {
  return new Promise((resolve, reject) => {
    const cid = `${Date.now()}-${Math.random()}`;
    //Механизм ожидания ответа
    //Каждое сообщение (payload) получает уникальный идентификатор cid.
    //Воркер отправляет сообщение мастеру через process.send().
    //Когда мастер ответит обратно (worker.send()), воркер перехватывает событие message.
    //Если пришёл ответ с таким же cid, промис завершается (resolve(msg)).
    const handler = (msg: any) => {
      if (!msg || msg.cid !== cid) return;
      process.off('message', handler);
      resolve(msg);
    };
    process.on('message', handler);
    (process as any).send({ ...payload, cid });
//Защита от зависания: Если за 5 секунд ответ от мастера не пришёл
// — промис отклоняется (чтобы сервер не “висел” в ожидании)

    setTimeout(() => {
      process.off('message', handler);
      reject(new Error('IPC timeout'));
    }, 5000);
  });
};

const handleNotFound = (res: http.ServerResponse) => {
  sendJson(res, 404, { message: 'Not Found' });
};
//Проверка входных данных пользователя
//Эта функция проверяет, что тело запроса содержит:
//имя (username) — строку,
//возраст (age) — число,
//хобби (hobbies) — массив строк.
//Если что-то не так — возвращает ошибку 400 (bad request)

const validateUserPayload = (payload: any): { ok: boolean; message?: string } => {
  if (!payload || typeof payload !== 'object') return { ok: false, message: 'Invalid body' };
  const { username, age, hobbies } = payload;
  if (typeof username !== 'string' || username.trim() === '') return { ok: false, message: 'username is required and must be string' };
  if (typeof age !== 'number') return { ok: false, message: 'age is required and must be number' };
  if (!Array.isArray(hobbies)) return { ok: false, message: 'hobbies must be array' };
  if (!hobbies.every(h => typeof h === 'string')) return { ok: false, message: 'hobbies must be array of strings' };
  return { ok: true };
};
//создание HTTP-сервера
export const createServer = (port: number) => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url ?? '/';
      const method = req.method ?? 'GET';
      //Маршрутизация (routing)
      //Воркер отправляет мастеру запрос "op": "getAll" 
      //получает всех пользователей и отдаёт клиенту
      if (url === '/api/users' && method === 'GET') {
        const reply = await makeIpcCall({ op: 'getAll' });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        return sendJson(res, 200, reply.result);
      }
//Проверяет, что id корректный, потом запрашивает конкретного пользователя у мастера
      if (url && url.startsWith('/api/users/') && method === 'GET') {
        const id = url.slice('/api/users/'.length);
        if (!isUuid(id)) return sendJson(res, 400, { message: 'Invalid userId' });
        const reply = await makeIpcCall({ op: 'get', id });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        return sendJson(res, 200, reply.result);
      }
//Читает тело запроса, проверяет поля
// и создаёт нового пользователя (мастер добавляет его в свою Map)
      if (url === '/api/users' && method === 'POST') {
        const body = await parseJsonBody(req);
        const valid = validateUserPayload(body);
        if (!valid.ok) return sendJson(res, 400, { message: valid.message });
        const reply = await makeIpcCall({ op: 'create', payload: body });
        if (!reply.ok) return sendJson(res, 500, { message: reply.error });
        return sendJson(res, 201, reply.result);
      }
//Проверяет данные, передаёт мастеру команду "op": "update" — обновить пользователя
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
//Удаляет пользователя, если ID корректен. Возвращает код 204 No Content
      if (url && url.startsWith('/api/users/') && method === 'DELETE') {
        const id = url.slice('/api/users/'.length);
        if (!isUuid(id)) return sendJson(res, 400, { message: 'Invalid userId' });
        const reply = await makeIpcCall({ op: 'delete', id });
        if (!reply.ok) return sendJson(res, reply.status ?? 500, { message: reply.error });
        // 204 no content
        res.writeHead(204);
        return res.end();
      }

//Если маршрут не совпадает — ответ 404 Not Found
      return handleNotFound(res);
    } catch (err: any) {
      sendJson(res, 500, { message: 'Internal Server Error' });
    }
  });
//Запуск сервера: Каждый воркер пишет в консоль свой PID и порт, на котором слушает
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Worker PID ${process.pid} listening on ${port}`);
  });

  return server;
};
