import app from './server';
import { config } from './config';

const server = app.listen(config.port, config.host, () => {
  console.log(`🚀 GST-Ready Accounting Ledger backend running at http://${config.host}:${config.port}`);
  console.log(`📊 Environment: ${config.env}`);
});

export default server;
