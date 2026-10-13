import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class GrammarAnswerInput {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  exerciseId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  answer: string;
}
