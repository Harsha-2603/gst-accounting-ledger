import { Router, Request, Response, NextFunction } from 'express';
import * as accountService from '../services/accountService';
import { NotFoundError } from '../errors';

const router = Router();

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = accountService.getAccounts();
    res.status(200).json(accounts);
  } catch (err) {
    next(err);
  }
});

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = accountService.createAccount(req.body);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const account = accountService.getAccountById(id);
    if (!account) {
      throw new NotFoundError(`Account '${id}' not found.`);
    }
    res.status(200).json(account);
  } catch (err) {
    next(err);
  }
});

export default router;
