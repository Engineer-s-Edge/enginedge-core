// textsplitter.module.ts
import { Module, Scope } from '@nestjs/common';
import TextSplitterService from './textsplitter.service';
import TextSplitterFactory from './textsplitter.factory';
import { CharacterTextSplitterAdapter } from './character/character';
import { RecursiveCharacterTextSplitterAdapter } from './character/recursive';
import { TokenTextSplitterAdapter } from './token/token';
import { HTMLHeaderTextSplitterAdapter } from './format/html_header';
import { HTMLSectionTextSplitterAdapter } from './format/html_section';
import { MarkdownTextSplitterAdapter } from './format/markdown';
import { CodeTextSplitterAdapter } from './code/code';
import { LatexTextSplitterAdapter } from './code/latex';
import { SemanticTextSplitterAdapter } from './semantic/semantic';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [CoreServicesModule],
  providers: [
    // All adapter classes required by TextSplitterFactory
    CharacterTextSplitterAdapter,
    RecursiveCharacterTextSplitterAdapter,
    TokenTextSplitterAdapter,
    HTMLHeaderTextSplitterAdapter,
    HTMLSectionTextSplitterAdapter,
    MarkdownTextSplitterAdapter,
    CodeTextSplitterAdapter,
    LatexTextSplitterAdapter,
    SemanticTextSplitterAdapter,
    // Factory and service
    TextSplitterFactory,
    {
      provide: TextSplitterService,
      useClass: TextSplitterService,
      scope: Scope.REQUEST,
    },
  ],
  exports: [TextSplitterService],
})
export default class TextSplitterModule {}
