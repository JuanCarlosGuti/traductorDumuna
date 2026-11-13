import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SrsStatusDto,
  UpdatedProgressDto,
  SrsAnswerDto,
} from './dto/srs.dto';
import { SrsService } from './srs.service';

@ApiTags('srs')
@Controller('srs')
export class SrsController {
  constructor(private readonly srs: SrsService) {}

  @Get('next')
  @ApiOperation({
    summary: 'Next review card',
    description:
      'Deck = full vocabulary + the 300 most frequent Damana words. Returns due cards first, then new ones; card is null if nothing is left.',
  })
  @ApiOkResponse({ type: SrsStatusDto })
  nextCard(): SrsStatusDto {
    return this.srs.nextCard();
  }

  @Post('answer')
  @ApiOperation({
    summary: 'Record the answer to a card',
    description:
      'Updates progress with simplified SM-2: again resets the card (due now), hard/good/easy schedule the next review.',
  })
  @ApiOkResponse({ type: UpdatedProgressDto })
  @ApiNotFoundResponse({ description: 'The word is not in the deck' })
  answer(@Body() dto: SrsAnswerDto): UpdatedProgressDto {
    return this.srs.answer(dto.word, dto.grade);
  }
}
