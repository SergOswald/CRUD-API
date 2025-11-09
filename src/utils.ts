import { validate as uuidValidate } from 'uuid';
import { IncomingMessage } from 'http';

export const parseJsonBody = (req: IncomingMessage): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', err => reject(err));
  });
};

export const isUuid = (s: string): boolean => {
  return uuidValidate(s);
};

export const sendJson = (res: any, status: number, data?: unknown) => {
  const body = data === undefined ? null : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  if (body) res.end(body);
  else res.end();
};
