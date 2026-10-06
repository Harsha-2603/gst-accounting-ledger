import { Request, Response, NextFunction } from 'express';
import { db } from '../database';
import crypto from 'crypto';

export function idempotencyGuard(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

  if (!idempotencyKey || req.method === 'GET') {
    return next();
  }

  const cleanKey = String(idempotencyKey).trim();

  const existing = db.prepare('SELECT status_code, response_body FROM idempotency_keys WHERE key = ?').get(cleanKey) as any;

  if (existing) {
    res.setHeader('X-Cache-Hit', 'Idempotency-Guard');
    res.status(existing.status_code).json(JSON.parse(existing.response_body));
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: any): Response => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const id = 'idem_' + crypto.randomUUID().slice(0, 8);
        const now = new Date().toISOString();
        db.prepare(`
          INSERT OR IGNORE INTO idempotency_keys (id, key, request_hash, response_body, status_code, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, cleanKey, req.originalUrl, JSON.stringify(body), res.statusCode, now);
      } catch (err: any) {
        console.error('Idempotency persistence warning:', err.message);
      }
    }
    return originalJson(body);
  };

  next();
}
