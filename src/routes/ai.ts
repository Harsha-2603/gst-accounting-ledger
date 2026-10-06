import { Router, Request, Response, NextFunction } from 'express';
import * as aiCopilotService from '../services/aiCopilotService';
import { config } from '../config';

const router = Router();

router.post('/copilot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({
        statusCode: 400,
        error: 'BAD_REQUEST',
        message: 'Message field is required and must be a non-empty string.',
        details: []
      });
      return;
    }

    if (message.length > 1000) {
      res.status(400).json({
        statusCode: 400,
        error: 'BAD_REQUEST',
        message: 'Message length exceeds the maximum allowed limit of 1000 characters.',
        details: []
      });
      return;
    }

    const result = await aiCopilotService.askCopilot(message);
    res.status(200).json(result);
  } catch (err: any) {
    if (err.statusCode === 503 || err.code === 'AI_PROVIDER_UNAVAILABLE') {
      res.status(503).json({
        statusCode: 503,
        error: 'AI_PROVIDER_UNAVAILABLE',
        message: 'AI Copilot provider is temporarily unavailable or timed out. Your underlying accounting data is safe and fully operational.'
      });
      return;
    }
    next(err);
  }
});

export default router;
