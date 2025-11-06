# src_old TODOs - Implementation Status in Workers

This document tracks the implementation status of features that were marked as TODOs in `hexagon/src_old` and whether they have been implemented in the workers architecture.

## Summary

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Graph Component Service - Event Emitter | ⚠️ Partial | `assistant-worker` | Service exists but event integration unclear |
| Scheduled Learning - Timezone Configurable | ❌ Not Implemented | `assistant-worker` | Stub adapter with TODOs |
| Escalation Service - Notifications | ❌ Not Implemented | N/A | No centralized notification system found |
| Learning Mode - Component Merges | ❌ Not Found | N/A | No implementation found |
| Expert Service - Factory/Stream/ResearchSession | ✅ Partial | `assistant-worker` | Factory & stream exist, ResearchSession missing |
| Genius Service - Auth Context | ❌ Not Implemented | `assistant-worker` | userId passed via query params |
| Topic Catalog - Delete | ❌ Not Implemented | `assistant-worker` | Adapter exists but no delete method |
| News Integration | ✅ Implemented | `news-worker` | Full implementation with repository, service, caching |

---

## Detailed Findings

### 1. Graph Component Service - Event Emitter Integration

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/graph-component.service.ts`
- TODO: `// TODO: Integrate with actual event emitter when available`

**Status:** ⚠️ **Partial Implementation**

**Findings:**
- **Location:** `enginedge-workers/assistant-worker/src/application/services/knowledge-graph.service.ts`
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/adapters/knowledge-graph/neo4j.adapter.ts`
- `GraphComponentService` is registered in `ApplicationModule` (`assistant-worker`)
- `KnowledgeGraphService` exists with Neo4j adapter
- No explicit event emitter integration found in the current implementation
- The service appears to be functional but may not be fully integrated with application-wide event system

**Recommendation:** Review if event emitter integration is still needed or if the current architecture handles events differently.

---

### 2. Scheduled Learning Service - Configurable Timezone

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/scheduled-learning.service.ts`
- TODO: `timezone: 'America/New_York', // TODO: Make configurable`

**Status:** ❌ **Not Implemented**

**Findings:**
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/adapters/implementations/scheduled-learning.adapter.ts`
- Adapter exists but contains multiple TODOs:
  - `// TODO: Inject real ScheduledLearningManager when available`
  - `// TODO: Delegate to real ScheduledLearningManager`
- Currently a stub implementation with in-memory storage
- `scheduling-worker` exists but no timezone-configurable scheduled learning found
- No configuration for timezone in the adapter

**Recommendation:** Implement `ScheduledLearningManager` with timezone configuration support.

---

### 3. Escalation Service - Notification Integration

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/escalation.service.ts`
- TODOs:
  - `// TODO: integrate with notification system`
  - `// TODO: Trigger research continuation (notify GeniusAgent)`
  - `// TODO: Implement notification logic`

**Status:** ❌ **Not Implemented**

**Findings:**
- **Location:** `enginedge-workers/interview-worker/src/application/services/notification.service.ts`
  - Contains stub: `// No-op stub for now; integrate with email provider later`
- **Location:** `enginedge-workers/assistant-worker/src/domain/agents/collective-agent/collective-agent.ts`
  - Has escalation logic for deadlocks but no notification system integration
- No centralized notification system found
- No integration between escalation and notification services
- No mechanism to trigger research continuation via notifications

**Recommendation:** 
1. Implement centralized notification service
2. Integrate escalation service with notification system
3. Add mechanism to notify GeniusAgent for research continuation

---

### 4. Learning Mode Service - Component Merge Tracking

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/learning-mode.service.ts`
- TODO: `// TODO: Track component merges (requires GraphComponentService integration)`

**Status:** ❌ **Not Found**

**Findings:**
- No `LearningModeService` found in workers
- No component merge tracking implementation found
- `GraphComponentService` exists but no merge tracking integration

**Recommendation:** Implement learning mode service with component merge tracking if this feature is still needed.

---

### 5. Expert Service - Factory Pattern, Streaming, ResearchSession

**Original TODO:**
- Location: `hexagon/src_old/_features/assistants/expert/services/expert.service.ts`
- TODOs:
  - `// TODO: Integrate with full ExpertAgent instantiation via factory pattern.`
  - `// TODO: Create Expert Agent instance via factory`
  - `// TODO: Integrate with ExpertAgent.stream() method`
  - `// TODO: Implement ResearchSession entity and repository`

**Status:** ✅ **Partially Implemented**

**Findings:**

**✅ Factory Pattern - IMPLEMENTED:**
- **Location:** `enginedge-workers/assistant-worker/src/domain/services/agent-factory.service.ts`
- `AgentFactory` exists with `createInstance()` method
- Supports expert agent creation: `case 'expert': return this.createExpertAgent(agent);`
- **Location:** `enginedge-workers/assistant-worker/src/application/application.module.ts`
- Factory is properly registered and injected

**✅ Streaming - IMPLEMENTED:**
- **Location:** `enginedge-workers/assistant-worker/src/domain/agents/expert-agent/expert-agent.ts`
- `ExpertAgent` extends `BaseAgent` and implements `runStream()` method
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/controllers/expert-agent.controller.ts`
- SSE endpoint exists: `@Get('research/stream')` with `@Sse()` decorator
- Full streaming implementation with progress events

**❌ ResearchSession - NOT IMPLEMENTED:**
- No `ResearchSession` entity found
- No `ResearchSession` repository found
- Research tracking appears to be handled differently (via `ExpertPoolManager`)

**Recommendation:** 
- Factory and streaming are complete ✅
- Consider implementing `ResearchSession` entity/repository if session persistence is needed

---

### 6. Genius Service - Auth Context (userId)

**Original TODO:**
- Location: `hexagon/src_old/_features/assistants/genius/genius.service.ts`
- TODO: `// TODO: Get userId from auth context`

**Status:** ❌ **Not Implemented**

**Findings:**
- **Location:** `enginedge-workers/assistant-worker/src/application/services/genius-agent.orchestrator.ts`
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/controllers/expert-agent.controller.ts`
- `userId` is passed via query parameters: `@Query('userId') userId: string`
- No unified auth context extraction mechanism
- Each controller/endpoint manually extracts userId from request

**Recommendation:** Implement unified auth context extraction (e.g., via decorator or guard) to automatically extract userId from JWT token.

---

### 7. Topics Service - Delete Functionality

**Original TODO:**
- Location: `hexagon/src_old/_features/assistants/genius/services/topics.service.ts`
- TODO: `// TODO: Implement delete in TopicCatalogService`

**Status:** ❌ **Not Implemented**

**Findings:**
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/adapters/interfaces/topic-catalog.adapter.interface.ts`
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/adapters/implementations/topic-catalog.adapter.ts`
- Interface (`ITopicCatalogAdapter`) has methods for:
  - `addTopic()`
  - `getTopic()`
  - `searchTopics()`
  - `getRecommendedTopics()`
  - `updateTopic()`
  - `getTrendingTopics()`
  - `trackResearch()`
- **Missing:** `deleteTopic()` method
- Implementation is currently a stub with in-memory storage and TODOs

**Recommendation:** Add `deleteTopic(topic: string): Promise<boolean>` to interface and implementation.

---

### 8. Escalations Service - Auth Context

**Original TODO:**
- Location: `hexagon/src_old/_features/assistants/genius/services/escalations.service.ts`
- TODO: `// TODO: Get from auth context`

**Status:** ❌ **Not Implemented**

**Findings:**
- Similar to Genius Service issue
- No unified auth context extraction
- userId likely passed via parameters/query

**Recommendation:** Same as Genius Service - implement unified auth context extraction.

---

### 9. News Integration Service

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/news-integration.service.ts`
- Comments: `// For now, we'll just note that the article is linked via properties` and `// Return empty array for now`

**Status:** ✅ **Fully Implemented**

**Findings:**
- **Location:** `enginedge-workers/news-worker/`
- **Repository:** 
  - `src/infrastructure/adapters/news/file-news.repository.ts`
  - `src/infrastructure/adapters/news/in-memory-news.repository.ts`
- **Service:** `src/application/services/news.service.ts`
- **Controller:** `src/infrastructure/controllers/news.controller.ts`
- **Features:**
  - Full CRUD operations (findAll, findById, findBySource, findByCategory, save, delete)
  - News feed with pagination and filtering
  - Search functionality
  - Trending topics
  - Redis caching integration
  - File-based and in-memory repository implementations

**Recommendation:** ✅ Complete - no action needed.

---

### 10. Category Service

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/category.service.ts`
- Comment: `// For now, return the async version result (this should be called in async context)`

**Status:** ⚠️ **Unclear**

**Findings:**
- No dedicated `CategoryService` found in workers
- Category functionality may be handled by:
  - News service (has category filtering)
  - Knowledge graph service (may handle categorization)

**Recommendation:** Clarify if category service is still needed or if functionality is handled elsewhere.

---

### 11. Topic Catalog Service - Placeholder Logic

**Original TODO:**
- Location: `hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/topic-catalog.service.ts`
- Comments:
  - `// For now, just return topics that need refresh`
  - `// For now, return high-priority unresearched topics`

**Status:** ⚠️ **Stub Implementation**

**Findings:**
- **Location:** `enginedge-workers/assistant-worker/src/infrastructure/adapters/implementations/topic-catalog.adapter.ts`
- Adapter exists but is a stub with in-memory storage
- Contains multiple TODOs for delegating to real service
- Basic functionality exists (add, get, search, update, track) but may not have full business logic

**Recommendation:** Implement full `TopicCatalogService` with refresh logic and priority-based topic selection.

---

## Overall Recommendations

### High Priority
1. **Implement centralized notification system** - Needed for escalation service
2. **Add delete method to TopicCatalogAdapter** - Missing functionality
3. **Implement unified auth context extraction** - Affects multiple services

### Medium Priority
1. **Complete ScheduledLearningManager** - Currently stub implementation
2. **Implement ResearchSession entity/repository** - If session persistence is needed
3. **Clarify CategoryService requirements** - Determine if still needed

### Low Priority
1. **Review event emitter integration** - May not be needed in current architecture
2. **Implement LearningModeService** - If component merge tracking is still required

---

## Notes

- The workers architecture appears to be a migration from the `src_old` structure
- Some features have been fully implemented (News Integration, Expert Factory/Streaming)
- Some features are partially implemented (Graph Component, Expert Service)
- Some features are missing entirely (Notifications, Auth Context, Delete operations)
- The architecture uses adapters/interfaces pattern, which is good for future extensibility

