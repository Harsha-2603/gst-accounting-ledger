import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../../gst_ledger.db'),
  baseCurrency: process.env.BASE_CURRENCY || 'INR',
  defaultStateCode: process.env.DEFAULT_STATE_CODE || '27',
  env: process.env.NODE_ENV || 'development',
  aiEnabled: process.env.AI_ENABLED === 'true',
  aiProvider: process.env.AI_PROVIDER || 'gemini',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gemini-1.5-flash'
};
