# LoaderService Enhanced Implementation

## Overview

The LoaderService has been completely enhanced with advanced preloading capabilities including vector store integration, smart prompt injection, URL detection, and progressive content shortening. This implementation provides comprehensive document and web content processing for AI agents.

## Features

### 🔄 Multi-Action File Processing
- **Deliver**: Files are passed directly to the agent
- **Parse**: File content is injected into the prompt
- **VStore**: Files are stored in vector store for semantic retrieval

### 🌐 Smart URL Detection
- Automatic URL detection in user prompts using regex patterns
- Web content loading and processing
- Option to store web content in vector store or summarize

### 🔍 Reference Processing
- **Vector Store References**: `<vectorstore>query</vectorstore>` - Semantic search in stored documents
- **Conversation References**: `<conversations>query</conversations>` - Search previous conversations
- **Link References**: `<link>url</link>` - Load and process specific web content

### 📊 Progressive Content Shortening
- **VStore Strategy**: Store large content in vector store, provide reference
- **Summarize Strategy**: Truncate content with summary indication
- **Drop Strategy**: Simple truncation

### ⚡ Generator-Based Processing
- Async generator pattern for progressive loading
- Cleanup functions for resource management
- Real-time progress updates

## Architecture

```
LoaderService
├── File Processing
│   ├── PDFDocumentLoader
│   ├── DOCXDocumentLoader
│   ├── CSVDocumentLoader
│   └── ... (other format loaders)
├── Web Content Loading
│   ├── CurlWebLoader
│   ├── CheerioWebLoader
│   └── ... (other web loaders)
├── Vector Store Integration
│   ├── Document Storage
│   ├── Semantic Search
│   └── Context Retrieval
├── Memory Integration
│   ├── Conversation Context
│   ├── Agent Memory
│   └── Context Orchestration
└── Smart Processing
    ├── URL Detection
    ├── Reference Parsing
    └── Content Shortening
```

## Usage

### Basic File Processing

```typescript
const attachments = [
  { files: [resumeFile], action: 'deliver' },
  { files: [dataFile], action: 'parse' },
  { files: [notesFile], action: 'vstore' }
];

const generator = await loaderService.preload(
  userPrompt, 
  attachments,
  DefaultParsingConfig,
  {
    userId: 'user123',
    conversationId: 'conv456',
    maxTokens: 8000,
    shorteningStrategy: 'vstore'
  }
);

for await (const result of generator) {
  console.log('Processing:', result.preloadInjection);
}
generator.cleanup();
```

### Vector Store References

```typescript
const userPrompt = `
  Based on <vectorstore>machine learning best practices</vectorstore> 
  and <vectorstore>coding standards</vectorstore>, 
  please review this code.
`;
```

### Conversation References

```typescript
const userPrompt = `
  Continue from <conversations>yesterday's meeting</conversations>
  and <conversations>architecture review</conversations>.
`;
```

### Link References

```typescript
const userPrompt = `
  Review docs at <link>https://docs.example.com</link>
  and examples at <link>https://github.com/example</link>.
`;
```

## Configuration Options

### PreloadOptions

```typescript
interface PreloadOptions {
  userId?: UserIdType;              // Required for vector store operations
  conversationId?: ConversationIdType; // For conversation context
  maxTokens?: number;               // Token limit (default: 8000)
  shorteningStrategy?: 'vstore' | 'summarize' | 'drop'; // Content shortening
}
```

### Attachment Actions

```typescript
type AttachmentAction = 'deliver' | 'parse' | 'vstore';

interface Attachment {
  files: File[];
  action: AttachmentAction;
}
```

## Implementation Details

### URL Detection
- Uses regex pattern: `/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g`
- Automatically processes detected URLs
- Configurable storage vs. summarization

### Vector Store Integration
- Automatic document chunking (default: 1000 chars, 200 overlap)
- Embedding generation for semantic search
- Metadata preservation (filename, size, upload date)
- User-based access control

### Reference Processing
- Uses configurable regex patterns from DefaultParsingConfig
- Semantic search with top-K results (default: 3)
- Content summarization for token efficiency
- Error handling with fallback messages

### Progressive Shortening
- Token estimation (4 chars ≈ 1 token)
- Multiple strategies based on use case
- Intelligent content preservation
- Vector store fallback for large content

## Error Handling

The service includes comprehensive error handling:

- **File Processing Errors**: Fallback to plain text reading
- **Web Loading Errors**: Graceful degradation with error messages
- **Vector Store Errors**: Fallback to alternative strategies
- **Reference Processing Errors**: Informative error messages in output

## Dependencies

### Required Modules
- `VectorStoreModule` - For document storage and retrieval
- `MemoryModule` - For conversation context management

### Document Loaders
- PDF, DOCX, CSV, EPUB, PPTX, SRT support
- Audio transcription (Whisper)
- Unstructured document processing
- Notion and Obsidian integration

### Web Loaders
- cURL-based web scraping
- Cheerio HTML parsing
- Playwright/Puppeteer for dynamic content
- GitHub repository loading
- YouTube transcript extraction

## Testing

Comprehensive test suite included (`loader.service.spec.ts`):

- Unit tests for all methods
- Integration tests with mocked dependencies
- Edge case handling verification
- Performance testing for large files

## Examples

See `loader.service.example.ts` for detailed usage examples including:

1. Basic file processing
2. URL detection and processing
3. Vector store references
4. Conversation references
5. Link references
6. Complex multi-feature scenarios
7. Progressive shortening demonstrations

## Performance Considerations

### Memory Management
- Generator pattern prevents memory buildup
- Cleanup functions for resource disposal
- Streaming processing for large files

### Token Optimization
- Smart content shortening
- Vector store references instead of full content
- Configurable token limits
- Progressive loading strategies

### Scalability
- Async processing throughout
- Batch operations for multiple files
- Efficient vector store queries
- Connection pooling for web requests

## Security

### Access Control
- User-based vector store access
- File permission validation
- Conversation privacy protection

### Input Validation
- MIME type verification
- URL validation and sanitization
- File size limits
- Content scanning capabilities

## Migration Guide

### From Previous Version
1. Add VectorStoreModule and MemoryModule imports
2. Update constructor with new dependencies
3. Migrate preload calls to new signature
4. Add cleanup() calls after generator usage

### Breaking Changes
- Method signature updated with options parameter
- Return type now includes cleanup function
- Async generator pattern required

## Roadmap

### Planned Enhancements
- [ ] Support for more document formats
- [ ] Advanced content summarization
- [ ] Parallel processing capabilities
- [ ] Caching mechanisms
- [ ] Real-time collaboration features
- [ ] Enhanced security features

### Performance Optimizations
- [ ] Streaming vector store operations
- [ ] Intelligent prefetching
- [ ] Content deduplication
- [ ] Compressed storage options
