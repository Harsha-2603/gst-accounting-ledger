import express, { Application } from 'express';
import cors from 'cors';
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

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(idempotencyGuard);

// Health check endpoint
app.use('/', healthRouter);

// API v1 Routers
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/items', itemsRouter);

// Global Error Middleware
app.use(errorHandler);

export default app;
