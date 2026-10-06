import { Router, Request, Response, NextFunction } from 'express';
import * as invoiceService from '../services/invoiceService';
import { validateCreateInvoiceDTO } from '../validation';
import { NotFoundError } from '../errors';

const router = Router();

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    validateCreateInvoiceDTO(req.body);
    const result = invoiceService.createInvoice(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/void', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const reason = req.body ? req.body.reason : undefined;
    const result = invoiceService.voidInvoice(id, reason);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/deliver', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = invoiceService.deliverInvoice(id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoices = invoiceService.getInvoices(req.query as any);
    res.status(200).json(invoices);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const invoice = invoiceService.getInvoiceById(id);
    if (!invoice) {
      throw new NotFoundError(`Invoice '${id}' not found.`);
    }
    res.status(200).json(invoice);
  } catch (err) {
    next(err);
  }
});

export default router;
