import { z } from 'zod';

export const ExplanationPayloadSchema = z.object({
  explanation: z.string(),
  rule: z.string(),
  example: z.object({
    japanese: z.string(),
    reading: z.string(),
    translation: z.string(),
  }),
});

export type ExplanationPayload = z.infer<typeof ExplanationPayloadSchema>;
