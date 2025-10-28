import { Injectable } from '@nestjs/common';
import {
  CharacterSplitterOptions,
  CharacterTextSplitterAdapter,
} from './character/character';
import {
  RecursiveCharacterTextSplitterAdapter,
  RecursiveSplitterOptions,
} from './character/recursive';
import { TokenSplitterOptions, TokenTextSplitterAdapter } from './token/token';
import {
  HTMLHeaderTextSplitterAdapter,
  HTMLHeaderTextSplitterOptions,
} from './format/html_header';
import {
  HTMLSectionTextSplitterAdapter,
  HTMLSectionTextSplitterOptions,
} from './format/html_section';
import {
  MarkdownHeaderSplitterOptions,
  MarkdownTextSplitterAdapter,
} from './format/markdown';
import { CodeSplitterOptions, CodeTextSplitterAdapter } from './code/code';
import { LatexSplitterOptions, LatexTextSplitterAdapter } from './code/latex';
import {
  SemanticSplitterOptions,
  SemanticTextSplitterAdapter,
} from './semantic/semantic';
import { TextSplitterAdapter } from './utils/adapter.interface';

export type TextSplitterType =
  | 'character'
  | 'recursive'
  | 'token'
  | 'html-header'
  | 'html-section'
  | 'markdown'
  | 'latex'
  | 'code'
  | 'semantic';

export type TextSplitterOptionsMap = {
  character: CharacterSplitterOptions;
  recursive: RecursiveSplitterOptions;
  code: CodeSplitterOptions;
  latex: LatexSplitterOptions;
  'html-header': HTMLHeaderTextSplitterOptions;
  'html-section': HTMLSectionTextSplitterOptions;
  markdown: MarkdownHeaderSplitterOptions;
  semantic: SemanticSplitterOptions;
  token: TokenSplitterOptions;
};

export type TextSplitterConfig = {
  type: keyof TextSplitterOptionsMap;
  options: TextSplitterOptionsMap[keyof TextSplitterOptionsMap];
};

// textsplitter.factory.ts
@Injectable()
export default class TextSplitterFactory {
  constructor(
    private char: CharacterTextSplitterAdapter,
    private rec: RecursiveCharacterTextSplitterAdapter,
    private tok: TokenTextSplitterAdapter,
    private htmlHdr: HTMLHeaderTextSplitterAdapter,
    private htmlSec: HTMLSectionTextSplitterAdapter,
    private mdDr: MarkdownTextSplitterAdapter,
    private code: CodeTextSplitterAdapter,
    private latex: LatexTextSplitterAdapter,
    private semantic: SemanticTextSplitterAdapter,
  ) {}

  getSplitter<T extends TextSplitterType>(
    type: T,
  ): TextSplitterAdapter<T, TextSplitterOptionsMap[T]> {
    switch (type) {
      case 'recursive':
        return this.rec as any;
      case 'token':
        return this.tok as any;
      case 'html-header':
        return this.htmlHdr as any;
      case 'html-section':
        return this.htmlSec as any;
      case 'markdown':
        return this.mdDr as any;
      case 'code':
        return this.code as any;
      case 'latex':
        return this.latex as any;
      case 'semantic':
        return this.semantic as any;
      case 'character':
      default:
        return this.char as any;
    }
  }
}
