//master-db.ts
//“память и логика базы данных” для главного процесса (master) в кластере Node.js.
//когда воркеры (рабочие процессы) хотят что-то сделать с пользователями — они посылают сообщение главному процессу, 
//а этот модуль обрабатывает его и отвечает обратно

import { User } from './types';
//Импортируется тип User (структура данных пользователя)
import { v4 as uuidv4 } from 'uuid';
//Функция uuidv4() создаёт уникальные идентификаторы
import cluster from 'cluster';
//нужен, чтобы отправлять ответ обратно воркеру

type IPCRequest =
  | { cid: string; op: 'getAll' }
  | { cid: string; op: 'get'; id: string }
  | { cid: string; op: 'create'; payload: Omit<User,'id'> }
  | { cid: string; op: 'update'; id: string; payload: Partial<Omit<User,'id'>> }
  | { cid: string; op: 'delete'; id: string };

  //перечисление возможных запросов, которые может прислать воркер:
//getAll — получить всех пользователей
//get — получить одного по id
//create — создать нового пользователя (без id, оно добавляется автоматически)
//update — обновить поля пользователя
//delete — удалить пользователя.

type IPCResponse = { cid: string; ok: true; result?: unknown } | { cid: string; ok: false; error: string; status?: number };
//Это тип ответа, который главный процесс отправит воркеру:
//если ok: true — операция успешна, данные в result
//если ok: false — произошла ошибка (error и, возможно, HTTP-статус)

const users: Map<string, User> = new Map();
//Используется Map, чтобы хранить пользователей в памяти:
//ключ — id;
//значение — объект User.

export const handleMasterMessage = (msg: IPCRequest, worker: cluster.Worker) => {
  //Эта функция вызывается, когда воркер присылает сообщение
//Параметры:
//msg — запрос (операция, id, данные)
//worker — объект воркера, которому потом нужно вернуть ответ

  const cid = msg.cid;
  try {
    switch (msg.op) {
      case 'getAll':
        worker.send({ cid, ok: true, result: Array.from(users.values()) } as IPCResponse);
        return;
        //Возвращает массив всех пользователей, которые хранятся в Map
      case 'get':
        //Если пользователя с таким id нет — отправляет ошибку 404
        //Если есть — возвращает объект пользователя
        {
          const u = users.get(msg.id);
          if (!u) { worker.send({ cid, ok: false, error: 'User not found', status: 404 }); return; }
          worker.send({ cid, ok: true, result: u });
          return;
        }
      case 'create':
        //Создаёт нового пользователя: генерирует id, сохраняет в Map, 
        //возвращает созданный объект.
        {
          const id = uuidv4();
          const newUser: User = { id, username: msg.payload.username, age: msg.payload.age, hobbies: msg.payload.hobbies ?? [] };
          users.set(id, newUser);
          worker.send({ cid, ok: true, result: newUser });
          return;
        }
      case 'update':
        //Если пользователь найден, обновляет поля, 
        //сохраняет и возвращает обновлённый вариант
        {
          const u = users.get(msg.id);
          if (!u) { worker.send({ cid, ok: false, error: 'User not found', status: 404 }); return; }
          const updated: User = { ...u, ...msg.payload };
          users.set(msg.id, updated);
          worker.send({ cid, ok: true, result: updated });
          return;
        }
      case 'delete':
        //Удаляет запись из Map. Если не найден — возвращает 404
        {
          const existed = users.delete(msg.id);
          if (!existed) { worker.send({ cid, ok: false, error: 'User not found', status: 404 }); return; }
          worker.send({ cid, ok: true, result: null });
          return;
        }
      default:
        //Неизвестная операция
        worker.send({ cid, ok: false, error: 'Unknown op' });
    }
  } catch (err: any) {
    worker.send({ cid, ok: false, error: 'Internal error' });
  }
};
