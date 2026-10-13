import Anthropic from '@anthropic-ai/sdk';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { ExplanationLanguage } from '../constants/explanation-language.constant';
import { ClaudeExplanationGenerator } from './claude-explanation-generator';
import { ExplanationUnavailableError } from './explanation-generator';
import { EXPLANATION_SYSTEM_PROMPT } from './explanation-prompt';

const input = {
  kanji: '本',
  kana: 'ほん',
  meaningEn: 'book',
  quizType: QuizType.Vocabulary,
  form: null,
  correctAnswer: 'book',
  chosenAnswer: 'water',
  language: ExplanationLanguage.En,
};

const payload = {
  explanation: '本 means book.',
  rule: 'ほん = book.',
  example: { japanese: '本を読みます。', reading: 'ほんをよみます。', translation: 'I read a book.' },
};

function generatorWith(parse: jest.Mock) {
  const client = { messages: { parse } } as unknown as Anthropic;
  return new ClaudeExplanationGenerator(client, 'claude-opus-5-5');
}

describe('ClaudeExplanationGenerator', () => {
  it('calls messages.parse with the model, system prompt, effort and schema, and returns the payload', async () => {
    const parse = jest.fn().mockResolvedValue({ stop_reason: 'end_turn', parsed_output: payload });
    await expect(generatorWith(parse).generate(input)).resolves.toEqual(payload);

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.system).toBe(EXPLANATION_SYSTEM_PROMPT);
    expect(request.output_config.effort).toBe('medium');
    expect(request.output_config.format).toBeDefined();
    expect(request.messages[0].content).toContain('<learner_answer>water</learner_answer>');
  });

  it('exposes the model name', () => {
    expect(generatorWith(jest.fn()).model).toBe('claude-opus-5-5');
  });

  it.each([
    ['a refusal', { stop_reason: 'refusal', parsed_output: null }],
    ['a truncated answer', { stop_reason: 'max_tokens', parsed_output: null }],
    ['an unparsable answer', { stop_reason: 'end_turn', parsed_output: null }],
    ['an empty field', { stop_reason: 'end_turn', parsed_output: { ...payload, rule: '  ' } }],
  ])('throws ExplanationUnavailableError on %s', async (_label, response) => {
    const parse = jest.fn().mockResolvedValue(response);
    await expect(generatorWith(parse).generate(input)).rejects.toBeInstanceOf(ExplanationUnavailableError);
  });

  it('wraps SDK errors without leaking details', async () => {
    const parse = jest.fn().mockRejectedValue(new Error('401 invalid x-api-key sk-ant-secret'));
    const error = await generatorWith(parse).generate(input).catch((e) => e);
    expect(error).toBeInstanceOf(ExplanationUnavailableError);
    expect(error.message).not.toContain('sk-ant');
  });
});
