import dotenv from 'dotenv';
dotenv.config();
import cluster from 'cluster';
import { cpus } from 'os';
import http from 'http';
import { handleMasterMessage } from './master-db';
import { createServer } from './server';

const PORT = Number(process.env.PORT ?? 4000);

if (cluster.isMaster) {
  const numWorkers = Math.max(1, cpus().length - 1);
  const workerPorts: number[] = [];

  // spawn workers
  for (let i = 0; i < numWorkers; i++) {
    const port = PORT + 1 + i;
    const env = { ...process.env, WORKER_PORT: String(port) };
    const worker = cluster.fork(env);
    workerPorts.push(port);
    // Listen for messages from worker
    worker.on('message', (msg: any) => {
      handleMasterMessage(msg, worker);
    });
  }

  // simple round-robin load balancer on PORT
  let rrIndex = 0;
  const server = http.createServer((req, res) => {
    if (workerPorts.length === 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'No workers' }));
      return;
    }

    // choose next worker
    const targetPort = workerPorts[rrIndex % workerPorts.length];
    rrIndex++;

    // proxy request to worker
    const opts = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: req.headers
    };

    const proxyReq = http.request(opts, proxyRes => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

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
