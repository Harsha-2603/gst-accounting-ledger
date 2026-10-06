import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

router.get('/health', (req: Request, res: Response) => {
  try {
    const dbTest = db.prepare('SELECT 1 as ok').get() as any;
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: dbTest && dbTest.ok === 1 ? 'CONNECTED' : 'DISCONNECTED',
      uptime: process.uptime()
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'ERROR',
      message: err.message
    });
  }
});

export default router;
