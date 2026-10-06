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

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, hsnCode, unitPrice, defaultTaxRate } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ statusCode: 400, error: 'BAD_REQUEST', message: 'Item name is required.' });
      return;
    }
    const id = 'item_' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const hsn = hsnCode || '8471';
    const price = Number(unitPrice) || 0;
    const rate = Number(defaultTaxRate) || 18.0;

    const salesAcc = db.prepare("SELECT id FROM accounts WHERE code = '4000'").get() as any;
    const incomeAccId = salesAcc ? salesAcc.id : null;

    db.prepare(`
      INSERT INTO items (id, name, hsn_code, unit_price, default_tax_rate, income_account_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, hsn, price, rate, incomeAccId, now);

    res.status(201).json({ id, name, hsnCode: hsn, unitPrice: price, defaultTaxRate: rate, createdAt: now });
  } catch (err) {
    next(err);
  }
});

export default router;
