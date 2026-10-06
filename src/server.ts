import express, { Application } from 'express';
import cors from 'cors';
import path from 'path';
import { idempotencyGuard } from './middleware/idempotency';
import { errorHandler } from './middleware/errorHandler';

import healthRouter from './routes/health';
import invoicesRouter from './routes/invoices';
import paymentsRouter from './routes/payments';
import accountsRouter from './routes/accounts';
import transactionsRouter from './routes/transactions';
import reportsRouter from './routes/reports';
import customersRouter from './routes/customers';
import itemsRouter from './routes/items';
import aiRouter from './routes/ai';

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(idempotencyGuard);

// Serve frontend static assets from public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Health check endpoint
app.use('/', healthRouter);
app.use('/api', healthRouter);

// API v1 Routers
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/ai', aiRouter);

// Global Error Middleware
app.use(errorHandler);

export default app;
