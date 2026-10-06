import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../database';
import { numVal } from '../domain/decimal';

const router = Router();

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = db.prepare('SELECT id, name, hsn_code as hsnCode, unit_price as unitPrice, default_tax_rate as defaultTaxRate FROM items ORDER BY name ASC').all() as any[];
    res.status(200).json(items.map(item => ({
      ...item,
      unitPrice: numVal(item.unitPrice),
      defaultTaxRate: numVal(item.defaultTaxRate)
    })));
  } catch (err) {
    next(err);
  }
});

export default router;
