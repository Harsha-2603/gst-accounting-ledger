import { Request, Response, NextFunction } from 'express';
export declare function idempotencyGuard(req: Request, res: Response, next: NextFunction): void;
