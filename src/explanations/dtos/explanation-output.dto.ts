import { ApiProperty } from '@nestjs/swagger';

export class ExplanationExampleOutput {
  @ApiProperty()
  japanese: string;

  @ApiProperty({ description: 'Whole sentence in hiragana' })
  reading: string;

  @ApiProperty()
  translation: string;
}

export class ExplanationOutput {
  @ApiProperty()
  explanation: string;

  @ApiProperty()
  rule: string;

  @ApiProperty({ type: ExplanationExampleOutput })
  example: ExplanationExampleOutput;

  @ApiProperty({ description: 'True when served from the explanation cache' })
  cached: boolean;
}
