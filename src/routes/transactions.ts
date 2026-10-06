import { Router, Request, Response, NextFunction } from 'express';
import * as ledgerService from '../services/ledgerService';

const router = Router();

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const transactions = ledgerService.getTransactions(req.query as any);
    res.status(200).json({ transactions });
  } catch (err) {
    next(err);
  }
});

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = ledgerService.postJournalEntry(req.body);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

export default router;

