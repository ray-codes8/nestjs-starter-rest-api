import { QuizType } from '../../progress/constants/quiz-type.constant';
import { VerbForm } from '../../quiz/domain/conjugation';
import { ExplanationLanguage } from '../constants/explanation-language.constant';
import {
  buildExplanationPrompt,
  EXPLANATION_SYSTEM_PROMPT,
} from './explanation-prompt';

describe('buildExplanationPrompt', () => {
  it('describes a verb mistake with form, both answers and language', () => {
    const prompt = buildExplanationPrompt({
      kanji: '書く',
      kana: 'かく',
      meaningEn: 'to write',
      quizType: QuizType.Verb,
      form: VerbForm.Te,
      correctAnswer: '書いて',
      chosenAnswer: '書きて',
      language: ExplanationLanguage.Ru,
    });

    expect(prompt).toContain('verb conjugation');
    expect(prompt).toContain('書く (かく)');
    expect(prompt).toContain('to write');
    expect(prompt).toContain('て-form');
    expect(prompt).toContain('Correct answer: 書いて');
    expect(prompt).toContain('<learner_answer>書きて</learner_answer>');
    expect(prompt).toContain('Explain in: Russian');
  });

  it('describes a vocabulary mistake for a kana-only word without a form line', () => {
    const prompt = buildExplanationPrompt({
      kanji: null,
      kana: 'ここ',
      meaningEn: 'here',
      quizType: QuizType.Vocabulary,
      form: null,
      correctAnswer: 'here',
      chosenAnswer: 'there',
      language: ExplanationLanguage.En,
    });

    expect(prompt).toContain('vocabulary');
    expect(prompt).toContain('Word: ここ');
    expect(prompt).not.toContain('Target form');
    expect(prompt).toContain('<learner_answer>there</learner_answer>');
    expect(prompt).toContain('Explain in: English');
  });

  it('tells the model the learner answer is data, not instructions', () => {
    expect(EXPLANATION_SYSTEM_PROMPT).toContain('<learner_answer>');
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/not instructions/i);
  });
});
