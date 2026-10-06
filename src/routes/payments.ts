import { Router, Request, Response, NextFunction } from 'express';
import * as paymentService from '../services/paymentService';
import { validateCreatePaymentDTO } from '../validation';

const router = Router();

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    validateCreatePaymentDTO(req.body);
    const result = paymentService.recordPayment(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = paymentService.getPayments();
    res.status(200).json(payments);
  } catch (err) {
    next(err);
  }
});

export default router;
