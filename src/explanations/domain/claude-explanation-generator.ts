import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  ExplanationGenerator,
  ExplanationPromptInput,
  ExplanationUnavailableError,
} from './explanation-generator';
import {
  buildExplanationPrompt,
  EXPLANATION_SYSTEM_PROMPT,
} from './explanation-prompt';
import {
  ExplanationPayload,
  ExplanationPayloadSchema,
} from './explanation-schema';

export const DEFAULT_EXPLANATION_MODEL = 'claude-opus-5-5';

function isComplete(payload: ExplanationPayload): boolean {
  return [
    payload.explanation,
    payload.rule,
    payload.example.japanese,
    payload.example.reading,
    payload.example.translation,
  ].every((text) => text.trim().length > 0);
}

export class ClaudeExplanationGenerator implements ExplanationGenerator {
  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  async generate(input: ExplanationPromptInput): Promise<ExplanationPayload> {
    let response;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: EXPLANATION_SYSTEM_PROMPT,
        output_config: {
          effort: 'medium',
          format: zodOutputFormat(ExplanationPayloadSchema),
        },
        messages: [{ role: 'user', content: buildExplanationPrompt(input) }],
      });
    } catch (error) {
      // Only the error class: SDK messages can echo request details.
      const kind = error instanceof Error ? error.constructor.name : 'unknown';
      throw new ExplanationUnavailableError(`Claude request failed (${kind})`);
    }

    if (response.stop_reason !== 'end_turn') {
      throw new ExplanationUnavailableError(`Unexpected stop reason: ${response.stop_reason}`);
    }
    const payload = response.parsed_output;
    if (!payload || !isComplete(payload)) {
      throw new ExplanationUnavailableError('Claude returned an incomplete explanation');
    }
    return payload;
  }
}
