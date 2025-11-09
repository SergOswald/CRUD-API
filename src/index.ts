// index.ts
//точка входа приложения
//запускает кластер (несколько процессов, воркеров)
//распределяет обработку HTTP-запросов между ними, 
// сохраняя данные о пользователях в памяти главного процесса
import dotenv from 'dotenv';
dotenv.config();
import cluster from 'cluster';
import { cpus } from 'os';
import { createServer } from './server';
import { User } from './types';

const PORT = Number(process.env.PORT ?? 4000);
//Проверка — главный процесс или воркер
if (cluster.isPrimary) {
  const numCPUs = cpus().length;
  const users: Record<string, User> = {};

  // обработка сообщений от воркеров
  cluster.on('message', (worker, msg: any) => {
    //Когда воркеру нужно создать пользователя, 
    // он посылает сообщение главному процессу, и тот выполняет операцию над users
    //getAll — вернуть всех пользователей.
    //get — вернуть конкретного по id.
    //create — создать нового (crypto.randomUUID() генерирует уникальный ID).
    //update — обновить существующего.
    //delete — удалить пользователя.
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
        //После выполнения операция, главный процесс отправляет результат обратно воркеру
        //cid — идентификатор запроса, чтобы воркер знал, к какому клиентскому запросу относится ответ
      }
    } catch (err) {
      worker.send({ cid, ok: false, error: String(err) });
    }
  });

  // Создаются 2 воркера (или меньше, если ядер меньше двух).
//Каждый воркер будет слушать HTTP-порт 4000 и принимать запросы.
  for (let i = 0; i < Math.min(2, numCPUs); i++) {
    cluster.fork();
  }

} else {
  createServer(PORT);
  //Если процесс не главный, значит это воркер, 
  // который просто запускает HTTP-сервер через createServer(PORT).
}
