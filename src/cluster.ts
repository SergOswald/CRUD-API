//много-процессный сервер Node.js с балансировкой нагрузки
import dotenv from 'dotenv';
dotenv.config();
//Подключается библиотека dotenv, которая читает файл .env
//и подставляет значения из него в process.env
import cluster from 'cluster';
//встроенный модуль Node.js, который позволяет запускать 
// несколько процессов (воркеров), использующих все CPU ядра.
import { cpus } from 'os';
import http from 'http';
import { handleMasterMessage } from './master-db';
//обрабатывает IPC-сообщения от воркеров (взаимодействие с общей базой данных)
import { createServer } from './server';

const PORT = Number(process.env.PORT ?? 4000);
//Если в .env не указано PORT, сервер по умолчанию запустится на 4000
if (cluster.isMaster) {
  //Проверка: мастер или воркер
  //master (главный процесс) — создаёт и управляет воркерами
  //worker — отдельный процесс, который слушает порт и обрабатывает HTTP-запросы
  const numWorkers = Math.max(1, cpus().length - 1);
  //Определяет число воркеров
  const workerPorts: number[] = [];

  for (let i = 0; i < numWorkers; i++) {
    const port = PORT + 1 + i;
    //воркеры слушают 4001
    const env = { ...process.env, WORKER_PORT: String(port) };
    const worker = cluster.fork(env);
    workerPorts.push(port);
    // Listen for messages from worker
    worker.on('message', (msg: any) => {
      handleMasterMessage(msg, worker);
    });
  }

  let rrIndex = 0;
  const server = http.createServer((req, res) => {
    if (workerPorts.length === 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'No workers' }));
      return;
    }

    // Организует Round-Robin балансировку
    const targetPort = workerPorts[rrIndex % workerPorts.length];
    rrIndex++;

    //Первый запрос идёт в воркер №1, второй — №2, и т.д.
    //После последнего — снова на первого (по кругу).

    // proxy request to worker
    const opts = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: req.headers
    };

    //Проксирует запрос к воркеру
    const proxyReq = http.request(opts, proxyRes => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    //мастер не обрабатывает сам запрос,
    //а пересылает его воркеру и возвращает ответ обратно клиенту.
    req.pipe(proxyReq, { end: true });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Bad gateway' }));
    });
  });

  server.listen(PORT, () => {
    console.log(`Master (load balancer) PID ${process.pid} listening on ${PORT}`);
    console.log(`Workers listening on ports: ${workerPorts.join(', ')}`);
  });

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
  });

} else {
  // worker code: each worker runs server on its assigned port
  const port = Number(process.env.WORKER_PORT);
  if (!port) {
    console.error('Worker missing WORKER_PORT');
    process.exit(1);
  }
  createServer(port);
}

//Каждый воркер запускает свой собственный HTTP-сервер (через твою функцию createServer)
