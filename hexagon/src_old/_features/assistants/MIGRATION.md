# Assistants Module Reorganization Guide

## What Changed

The assistants feature module has been reorganized from a flat structure into specialized submodules for better maintainability and separation of concerns.

### Before (Flat Structure)

```
features/assistants/
├── controllers/
│   ├── assistants.controller.ts
│   ├── builder.controller.ts
│   ├── graph.controller.ts
│   └── graph-builder.controller.ts
├── dto/
│   ├── assistant.dto.ts
│   ├── execution.dto.ts
│   ├── graph.dto.ts
│   └── graph-builder.dto.ts
├── entities/
│   └── assistant.entity.ts
├── repositories/
│   └── assistants.repository.ts
├── services/
│   ├── agent-config-factory.service.ts
│   ├── assistant-executor.service.ts
│   ├── assistants-crud.service.ts
│   ├── graph-agent-manager.service.ts
│   ├── graph-builder.service.ts
│   └── model-information.service.ts
├── genius/  (already organized)
├── assistants.module.ts
└── assistants.service.ts
```

### After (Modular Structure)

```
features/assistants/
├── common/                    # Shared infrastructure
│   ├── dto/
│   │   ├── assistant.dto.ts
│   │   └── execution.dto.ts
│   ├── entities/
│   │   └── assistant.entity.ts
│   ├── repositories/
│   │   └── assistants.repository.ts
│   ├── services/
│   │   ├── agent-config-factory.service.ts
│   │   ├── assistant-executor.service.ts
│   │   ├── assistants-crud.service.ts
│   │   └── model-information.service.ts
│   ├── common.module.ts
│   └── README.md
├── react/                     # ReAct agents
│   ├── controllers/
│   │   └── builder.controller.ts
│   ├── react.module.ts
│   └── README.md
├── graph/                     # Graph agents
│   ├── controllers/
│   │   ├── graph.controller.ts
│   │   └── graph-builder.controller.ts
│   ├── services/
│   │   ├── graph-agent-manager.service.ts
│   │   └── graph-builder.service.ts
│   ├── dto/
│   │   ├── graph.dto.ts
│   │   └── graph-builder.dto.ts
│   ├── graph.module.ts
│   └── README.md
├── genius/                    # Genius meta-learning (unchanged)
│   └── ...
├── assistants.controller.ts   # Root-level CRUD
├── assistants.module.ts       # Main module
├── assistants.service.ts      # Unified service
└── README.md
```

## Breaking Changes

### Import Paths

All import paths have been updated. If you have external references to assistants code, update them:

**DTOs:**
```typescript
// OLD
import { CreateAssistantDto } from './dto/assistant.dto';
import { ExecuteAssistantDto } from './dto/execution.dto';
import { GraphConfigDto } from './dto/graph-builder.dto';

// NEW
import { CreateAssistantDto } from './common/dto/assistant.dto';
import { ExecuteAssistantDto } from './common/dto/execution.dto';
import { GraphConfigDto } from './graph/dto/graph-builder.dto';
```

**Entities:**
```typescript
// OLD
import { Assistant } from './entities/assistant.entity';

// NEW
import { Assistant } from './common/entities/assistant.entity';
```

**Services:**
```typescript
// OLD
import { AssistantsCrudService } from './services/assistants-crud.service';
import { GraphBuilderService } from './services/graph-builder.service';

// NEW
import { AssistantsCrudService } from './common/services/assistants-crud.service';
import { GraphBuilderService } from './graph/services/graph-builder.service';
```

### Module Imports

If you were importing specific services from AssistantsModule, you can now import from submodules:

```typescript
// OLD
import { AssistantsModule } from '@features/assistants/assistants.module';
// Then individually inject services

// NEW - Import specific submodules for better tree-shaking
import { CommonModule } from '@features/assistants/common/common.module';
import { GraphModule } from '@features/assistants/graph/graph.module';
import { GeniusModule } from '@features/assistants/genius/genius.module';
```

## Migration Steps

### For External Code

1. **Find and Replace Imports**: Update all import paths to match new structure
2. **Test Compilation**: Run `npm run build` to catch any missed imports
3. **Update Tests**: Test files may also need import path updates

### For New Features

When adding new features:

1. **Determine Scope**: Is it common, react-specific, graph-specific, or genius-specific?
2. **Place in Correct Subfolder**: Follow the established patterns
3. **Update Module**: Add to appropriate submodule's providers/exports
4. **Document**: Update README.md in the subfolder

## Benefits of New Structure

1. **Clear Separation**: Each agent type has its own folder
2. **Better Tree-Shaking**: Import only what you need
3. **Easier Navigation**: Related code is grouped together
4. **Independent Development**: Work on one agent type without affecting others
5. **Shared Infrastructure**: Common code is explicitly identified
6. **Better Documentation**: Each subfolder has its own README

## API Routes (Unchanged)

All API endpoints remain the same:

- `/assistants/*` - Root CRUD endpoints
- `/assistants/builder/*` - React agent builder
- `/assistants/builder/graph/*` - Graph agent builder
- `/assistants/graph/:conversationId/*` - Graph execution control
- `/genius/*` - Genius agent endpoints
- `/topics/*` - Topic catalog
- `/escalations/*` - Escalation management

## Testing

All tests should continue to work. If you encounter import errors:

1. Update test imports to match new paths
2. Mock services from correct modules
3. Run `npm test` to verify

## Rollback (If Needed)

If critical issues arise, you can rollback using git:

```bash
cd main-node
git restore src/features/assistants/
```

## Questions?

See the README.md files in each subfolder for detailed documentation:

- `common/README.md` - Shared infrastructure
- `react/README.md` - ReAct agents
- `graph/README.md` - Graph agents  
- `genius/README.md` - Genius meta-learning
- `README.md` - Overall assistants module

## Summary

This reorganization improves code maintainability without changing any external behavior. All API endpoints, functionality, and database schemas remain exactly the same. Only internal code organization has changed.
