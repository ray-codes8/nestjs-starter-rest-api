import { ConfigService } from '@nestjs/config';

import { ClaudeExplanationGenerator } from './domain/claude-explanation-generator';
import { createExplanationGenerator } from './explanations.module';

const configWith = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('createExplanationGenerator', () => {
  it('is disabled without an API key', () => {
    expect(createExplanationGenerator(configWith({}))).toBeNull();
  });

  it('builds a Claude generator with a short timeout and a single retry', () => {
    const generator = createExplanationGenerator(
      configWith({ 'anthropic.apiKey': 'test-key', 'anthropic.model': 'claude-opus-5-5' }),
    );
    expect(generator).toBeInstanceOf(ClaudeExplanationGenerator);
    expect(generator?.model).toBe('claude-opus-5-5');
    const client = (generator as unknown as { client: { timeout: number; maxRetries: number } }).client;
    expect(client.timeout).toBe(30_000);
    expect(client.maxRetries).toBe(1);
  });
});
