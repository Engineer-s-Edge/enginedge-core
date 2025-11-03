declare module 'sanitize-html' {
  import { ParserOptions } from 'htmlparser2';

  function sanitizeHtml(
    html: string | number | null | undefined,
    options?: sanitizeHtml.Options,
    _recursing?: boolean,
  ): string;

  namespace sanitizeHtml {
    interface Options {
      allowedTags?: string[] | false;
      allowedAttributes?: Record<
        string,
        Array<string | { name: string; multiple?: boolean; values: string[] }>
      >;
      allowedClasses?: Record<string, Array<string | RegExp>>;
      allowedEmptyAttributes?: string[];
      allowedSchemes?: string[];
      allowedSchemesByTag?: Record<string, string[]>;
      allowedSchemesAppliedToAttributes?: string[];
      allowedScriptHostnames?: string[];
      allowedScriptDomains?: string[];
      allowedIframeHostnames?: string[];
      allowedIframeDomains?: string[];
      allowProtocolRelative?: boolean;
      allowVulnerableTags?: boolean;
      enforceHtmlBoundary?: boolean;
      nonBooleanAttributes?: string[];
      nonTextTags?: string[];
      selfClosing?: string[];
      disallowedTagsMode?:
        | 'discard'
        | 'escape'
        | 'recursiveEscape'
        | 'completelyDiscard';
      exclusiveFilter?: (frame: any) => boolean | 'excludeTag';
      textFilter?: (text: string, tag: string) => string;
      parseStyleAttributes?: boolean;
      allowedStyles?: Record<string, RegExp[]>;
      transformTags?: Record<
        string | '*',
        (tagName: string, attribs: Record<string, string>) => TransformResult
      >;
      parser?: ParserOptions;
      onOpenTag?: (name: string, attribs: Record<string, string>) => void;
      onCloseTag?: (name: string, isImplied: boolean) => void;
      nestingLimit?: number;
      [key: string]: any;
    }

    const defaults: Options;

    type TransformFunction = (
      tagName: string,
      attribs: Record<string, string>,
    ) => TransformResult;

    interface TransformResult {
      tagName: string;
      attribs: Record<string, string>;
      text?: string;
    }

    function simpleTransform(
      newTagName: string,
      newAttribs?: Record<string, string>,
      merge?: boolean,
    ): TransformFunction;
  }

  export = sanitizeHtml;
}
