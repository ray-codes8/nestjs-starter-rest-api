import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const PICTURE_FILE = /^\d{3}\.png$/;

// Unauthenticated on purpose: <img> tags cannot send the bearer token. Only NNN.png files are served.
@ApiExcludeController()
@Controller('kanji-pictures')
export class KanjiPictureController {
  constructor(private readonly config: ConfigService) {}

  @Get(':file')
  getPicture(@Param('file') file: string, @Res() res: Response) {
    const dir = path.resolve(this.config.get<string>('kanji.dir') ?? 'local/kanji', 'pictures');
    const full = path.join(dir, file);
    if (!PICTURE_FILE.test(file) || !fs.existsSync(full)) {
      throw new NotFoundException();
    }
    res.sendFile(full);
  }
}
