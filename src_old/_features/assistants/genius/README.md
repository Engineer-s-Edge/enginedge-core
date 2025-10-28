# Genius Agent API

REST API endpoints for the Genius Agent system - a meta-learning orchestrator that continuously expands the knowledge graph.

## Overview

The Genius Agent is an autonomous learning system that:
- Commands multiple Expert Agents for parallel research
- Supports 3 learning modes (User-Directed, Autonomous, Scheduled)
- Validates research quality automatically
- Integrates news articles from the datalake
- Escalates issues requiring user involvement
- Organizes knowledge using ICS methodology (L1-L6)

## Architecture

```
features/assistants/genius/
├── controllers/
│   ├── genius.controller.ts      # Learning control & statistics
│   ├── topics.controller.ts      # Topic catalog management
│   └── escalations.controller.ts # User escalation handling
├── services/
│   ├── genius.service.ts         # Main orchestration service
│   ├── topics.service.ts         # Topic CRUD operations
│   └── escalations.service.ts   # Escalation management
├── dto/
│   └── genius.dto.ts             # Request/response DTOs
└── genius.module.ts              # Module definition
```

## API Endpoints

### Learning Control

#### Start User-Directed Learning
```http
POST /genius/start/user-directed
Content-Type: application/json

{
  "topicIds": ["tp_...", "tp_..."],
  "maxConcurrentExperts": 1,
  "waitForCompletion": true
}
```

#### Start Autonomous Learning
```http
POST /genius/start/autonomous
Content-Type: application/json

{
  "batchSize": 5,
  "minPriority": 50,
  "preferOrganic": true,
  "maxConcurrentExperts": 1
}
```

#### Stop Learning
```http
POST /genius/stop
```

#### Get Status
```http
GET /genius/status
```

Response:
```json
{
  "isLearning": true,
  "currentSession": {
    "startTime": "2025-10-20T13:00:00Z",
    "topicsAttempted": 5,
    "topicsCompleted": 3,
    "expertReports": [...]
  },
  "expertPoolStats": {
    "activeExperts": 1,
    "totalExpertsSpawned": 10,
    "totalTopicsCompleted": 8
  }
}
```

#### Get Statistics
```http
GET /genius/statistics
```

### Scheduled Learning

#### Create Schedule
```http
POST /genius/schedule
Content-Type: application/json

{
  "name": "Daily Research",
  "cronExpression": "0 0 * * *",
  "enabled": true,
  "batchSize": 5,
  "timeBudgetMinutes": 30
}
```

#### List Schedules
```http
GET /genius/schedule
```

#### Get Schedule
```http
GET /genius/schedule/:jobId
```

#### Update Schedule
```http
PATCH /genius/schedule/:jobId
Content-Type: application/json

{
  "enabled": false
}
```

#### Delete Schedule
```http
DELETE /genius/schedule/:jobId
```

#### Execute Schedule Now
```http
POST /genius/schedule/:jobId/execute
```

### Topic Management

#### Add Topic
```http
POST /topics
Content-Type: application/json

{
  "name": "Quantum Computing",
  "category": "Computer Science",
  "description": "Study of quantum computation",
  "complexity": "L3_TOPIC"
}
```

#### Seed from Wikipedia
```http
POST /topics/seed
Content-Type: application/json

{
  "categories": ["Science", "Technology"],
  "limit": 100
}
```

#### Query Topics
```http
GET /topics?status=NOT_STARTED&category=Science&limit=50
```

#### Get Topic
```http
GET /topics/:topicId
```

#### Update Topic
```http
PATCH /topics/:topicId
Content-Type: application/json

{
  "status": "IN_PROGRESS"
}
```

#### Delete Topic
```http
DELETE /topics/:topicId
```

### Escalations

#### Query Escalations
```http
GET /escalations?status=NOTIFIED&priority=HIGH&limit=50
```

#### Get Active Escalations
```http
GET /escalations/active
```

#### Get Pending Notifications
```http
GET /escalations/pending
```

#### Get Statistics
```http
GET /escalations/statistics
```

Response:
```json
{
  "total": 45,
  "byStatus": {
    "detected": 5,
    "notified": 10,
    "in-discussion": 3,
    "resolved": 25,
    "cancelled": 2
  },
  "byType": {
    "validation-failure": 15,
    "hallucination": 8,
    "source-verification": 12,
    ...
  },
  "averageResolutionTime": 3600000,
  "resolutionRate": 85.5
}
```

#### Get Escalation
```http
GET /escalations/:escalationId
```

#### Notify User
```http
POST /escalations/:escalationId/notify
```

#### Start Discussion
```http
POST /escalations/:escalationId/discuss
```

#### Resolve Escalation
```http
POST /escalations/:escalationId/resolve
Content-Type: application/json

{
  "respondedAt": "2025-10-20T13:30:00Z",
  "decision": "approve",
  "comments": "Looks good, proceed",
  "continueResearch": true
}
```

#### Cancel Escalation
```http
POST /escalations/:escalationId/cancel
Content-Type: application/json

{
  "reason": "No longer relevant"
}
```

## Learning Modes

### 1. User-Directed
User explicitly selects topics to research.
- **Use case**: Targeted learning on specific subjects
- **Control**: Full user control over topic selection
- **Concurrency**: Configurable parallel execution

### 2. Autonomous
Agent auto-selects high-priority topics from catalog.
- **Use case**: Continuous background learning
- **Control**: Agent decides based on priority, categories, distance
- **Optimization**: Prefers organic discoveries, balances categories

### 3. Scheduled
Cron-based recurring research cycles.
- **Use case**: Regular maintenance and updates
- **Control**: Time-based automation with configurable parameters
- **Flexibility**: Can be enabled/disabled, executed manually

## Escalation Types

1. **CONTRADICTION** - Conflicting information detected
2. **VALIDATION_FAILURE** - Critical validation errors
3. **MISSING_INFORMATION** - Can't proceed without user input
4. **SOURCE_VERIFICATION** - Source reliability issues
5. **HALLUCINATION** - Detected hallucinations
6. **DUPLICATE_CONFLICT** - Can't auto-merge duplicates
7. **EXPERT_ERROR** - Expert agent encountered error
8. **LOW_QUALITY** - Quality score below threshold
9. **USER_REQUESTED** - Manual escalation

## Escalation State Machine

```
DETECTED → NOTIFIED → IN_DISCUSSION → RESOLVED → BACK_TO_RESEARCH
               ↓
           CANCELLED
```

## Integration

The Genius module is integrated into the Assistants module:

```typescript
// main-node/src/features/assistants/assistants.module.ts
import { GeniusModule } from './genius/genius.module';

@Module({
  imports: [
    // ... other imports
    GeniusModule,
  ],
})
export class AssistantsModule {}
```

## Core Dependencies

The Genius feature depends on these core infrastructure services:

- **ExpertPoolManager** - Spawns and manages Expert Agents
- **LearningModeService** - Implements 3 learning modes
- **ScheduledLearningManager** - Manages cron jobs
- **ValidationService** - 6-check validation pipeline
- **TopicCatalogService** - Topic discovery and tracking
- **KnowledgeGraphService** - Graph operations and statistics
- **NewsIntegrationService** - Datalake news integration
- **EscalationService** - User escalation management
- **CategoryService** - Category distance calculations

## Configuration

### Environment Variables

```env
# Learning defaults
GENIUS_AUTO_VALIDATE=true
GENIUS_DEFAULT_MODE=autonomous
GENIUS_MAX_CONCURRENT_EXPERTS=1

# Validation thresholds
GENIUS_MIN_QUALITY_SCORE=70
GENIUS_CONFIDENCE_THRESHOLD=0.7

# Escalation settings
GENIUS_AUTO_ESCALATE_CRITICAL=true
GENIUS_ESCALATION_EXPIRY_DAYS=7
```

## Example Usage

### Start a learning session
```bash
curl -X POST http://localhost:3000/genius/start/autonomous \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 3,
    "minPriority": 60,
    "preferOrganic": true
  }'
```

### Check status
```bash
curl http://localhost:3000/genius/status
```

### View active escalations
```bash
curl http://localhost:3000/escalations/active
```

### Resolve an escalation
```bash
curl -X POST http://localhost:3000/escalations/esc_123/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "respondedAt": "2025-10-20T13:30:00Z",
    "decision": "approve",
    "continueResearch": true
  }'
```

## Future Enhancements

- [ ] WebSocket real-time updates for learning progress
- [ ] Admin dashboard UI
- [ ] Email/Slack notifications for escalations
- [ ] Batch escalation resolution
- [ ] Learning history visualization
- [ ] Performance metrics and analytics
- [ ] A/B testing for learning strategies
