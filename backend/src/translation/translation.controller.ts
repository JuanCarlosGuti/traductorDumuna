import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  TranslatorStatusDto,
  TranslationResponseDto,
  TranslateDto,
  SavedValidationDto,
  ValidateTranslationDto,
} from './dto/translation.dto';
import { TranslationService } from './translation.service';

@ApiTags('translation')
@Controller('translate')
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Translator availability and engine',
    description:
      'Engines: ANTHROPIC_API_KEY → Claude (priority); TRANSLATOR_BASE_URL + TRANSLATOR_MODEL → OpenAI-compatible API (Ollama, Gemini, Groq, Hugging Face). With nothing configured: available=false.',
  })
  @ApiOkResponse({ type: TranslatorStatusDto })
  status(): TranslatorStatusDto {
    const config = this.translation.configuration();
    return {
      available: this.translation.available(),
      provider: config.provider,
      model: config.provider ? config.model : null,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Assisted Damana ↔ Spanish translation',
    description:
      'The prompt carries, in this order: applicable grammar rules, a word-by-word dictionary (exact → no accents → singular → prefix), proper names, and examples by similarity with quotas per domain (up to 6 everyday, 4 grammar, 4 biblical —2 if there are enough everyday ones—, 14 at most). It returns the gloss, the words without an equivalent (recorded as pending items), the applied rules and the confidence, plus all the support used.',
  })
  @ApiOkResponse({ type: TranslationResponseDto })
  @ApiServiceUnavailableResponse({ description: 'No engine configured (code: NO_PROVIDER)' })
  @ApiBadGatewayResponse({ description: 'Provider error or unparseable response' })
  translate(@Body() dto: TranslateDto): Promise<TranslationResponseDto> {
    return this.translation.translate(dto);
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Save a confirmed or corrected translation',
    description:
      'The «this translation is correct» and «correct it» buttons of the view: the pair is stored in the validated_pairs table, a future everyday source of maximum confidence.',
  })
  @ApiOkResponse({ type: SavedValidationDto })
  validate(@Body() dto: ValidateTranslationDto): SavedValidationDto {
    return this.translation.validate(dto);
  }
}
