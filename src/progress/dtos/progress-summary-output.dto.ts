import { ApiProperty } from '@nestjs/swagger';

export class ProgressSummaryOutput {
  @ApiProperty({ description: 'Words in the level' })
  total: number;

  @ApiProperty({ description: 'Words in Leitner box 4 or 5' })
  learned: number;

  @ApiProperty({ description: 'Words whose review time has passed' })
  dueToday: number;

  @ApiProperty({ description: 'Consecutive UTC days with answers, ending today or yesterday' })
  streakDays: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Correct share (0..1) over the last 7 days' })
  accuracy7d: number | null;
}
