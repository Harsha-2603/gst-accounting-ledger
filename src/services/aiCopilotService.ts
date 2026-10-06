/**
 * AI Accounting Copilot Service
 * Primary backend service for POST /api/ai/copilot.
 * Strictly READ-ONLY. Deterministic double-entry engine remains the source of truth.
 */

import { config } from '../config';
import { BadRequestError } from '../errors';
import { checkMutationIntent, isMutationIntent } from './ai/mutationShield';
import { getAIProvider, LocalDeterministicProvider } from './ai/aiProvider';

export interface CopilotResponse {
  answer: string;
  sources: string[];
  aiEnabled: boolean;
  provider?: string;
  isMutationRejected?: boolean;
}

export { isMutationIntent };

export async function askCopilot(message: string): Promise<CopilotResponse> {
  // 1. Validation
  if (!message || typeof message !== 'string' || message.trim() === '') {
    throw new BadRequestError('Query message is required and cannot be empty.');
  }

  const query = message.trim();

  // 2. Strict READ-ONLY Invariant: Intercept mutation intent before touching anything
  const shield = checkMutationIntent(query);
  if (shield.isMutation) {
    return {
      aiEnabled: config.aiEnabled,
      answer: shield.rejectionMessage || 'The AI Accounting Copilot is strictly read-only and cannot alter accounting records.',
      sources: ['security:read_only_invariant'],
      isMutationRejected: true
    };
  }

  // 3. Provider Failure Simulation / Testing Hook (docs/API.md & docs/PRD.md Scenario 8)
  if (query.toLowerCase().includes('force_provider_error')) {
    const error: any = new Error('AI Copilot provider is temporarily unavailable or timed out. Your underlying accounting data is safe and fully operational.');
    error.statusCode = 503;
    error.code = 'AI_PROVIDER_UNAVAILABLE';
    throw error;
  }

  // 4. Disabled State Handling (docs/API.md lines 370-376)
  if (!config.aiEnabled || query.toLowerCase().includes('simulate_disabled')) {
    return {
      aiEnabled: false,
      answer: 'AI Copilot is currently disabled. Core accounting features continue to work normally.',
      sources: []
    };
  }

  // 5. Gather read-only response from active provider with fallback resilience
  const provider = getAIProvider();

  try {
    const result = await provider.generateAnswer(query);
    return {
      aiEnabled: config.aiEnabled,
      answer: result.answer,
      sources: result.sources,
      provider: result.provider
    };
  } catch (err: any) {
    console.warn(`[AI Copilot] Provider '${provider.name}' failed (${err.message}). Falling back to local grounded reasoning.`);
    // Fallback to local deterministic reasoning
    const localFallback = new LocalDeterministicProvider();
    const fallbackResult = await localFallback.generateAnswer(query);
    return {
      aiEnabled: config.aiEnabled,
      answer: fallbackResult.answer,
      sources: fallbackResult.sources,
      provider: 'local-fallback'
    };
  }
}
