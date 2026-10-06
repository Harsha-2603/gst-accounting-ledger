import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../database';

const router = Router();

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const customers = db.prepare('SELECT id, name, gstin, state_code as stateCode, email, phone FROM customers ORDER BY name ASC').all();
    res.status(200).json(customers);
  } catch (err) {
    next(err);
  }
});

export default router;
