import { Router, Request, Response, NextFunction } from 'express';
import * as reportService from '../services/reportService';

const router = Router();

router.get('/trial-balance', (req: Request, res: Response, next: NextFunction) => {
  try {
    const toDate = req.query.toDate as string | undefined;
    const result = reportService.getTrialBalance(toDate);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/gstr-1', (req: Request, res: Response, next: NextFunction) => {
  try {
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const result = reportService.getGSTR1(fromDate, toDate);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
