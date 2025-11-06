# Unfinished Features

This document outlines the unfinished features, temporary implementations, and TODOs found in the codebase.

## 1. User Listing Endpoint

**Location:**
- `hexagon/src/infrastructure/auth/users.controller.ts`
- `api-gateway/src/auth/users.controller.ts`

**Description:**
In both the `hexagon` and `api-gateway` modules, the user listing endpoint is not implemented. It is marked with a "for now" comment and returns a placeholder message instead of a list of users. Additionally, the endpoint lacks the "admin only" role check.

**Code Snippet (`hexagon/src/infrastructure/auth/users.controller.ts`):**
```typescript
  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserByEmail(@Query('email') email?: string) {
    if (email) {
      return this.identity.getUserByEmail(email);
    }
    // List users - admin only, optional for now
    return { message: 'List users endpoint - admin only' };
  }
```

**Code Snippet (`api-gateway/src/auth/users.controller.ts`):**
```typescript
  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserByEmail(@Query('email') email?: string) {
    if (email) {
      return this.identity.getUserByEmail(email);
    }
    // List users - admin only, optional for now
    return { message: 'List users endpoint - admin only' };
  }
```

**Other Admin-Only Endpoints:**
The following endpoints in both `users.controller.ts` files are also marked as "Admin only" but lack a role check:
- `updateUser`
- `createUser`
- `deleteUser`

## 2. Numerous TODOs in `hexagon/src_old`

A scan of the codebase revealed a significant number of `TODO` comments in the `hexagon/src_old` directory, indicating that this part of the application is still under development.

### Key Findings:

- **Graph Component Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/graph-component.service.ts`):**
  - `// TODO: Integrate with actual event emitter when available`
    - The service is not yet connected to the application's event system.

- **Scheduled Learning Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/scheduled-learning.service.ts`):**
  - `timezone: 'America/New_York', // TODO: Make configurable`
    - The timezone is hardcoded and needs to be made configurable.

- **Escalation Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/escalation.service.ts`):**
  - `// TODO: integrate with notification system`
  - `// TODO: Trigger research continuation (notify GeniusAgent)`
  - `// TODO: Implement notification logic`
    - The escalation service is not fully implemented and lacks integration with a notification system.

- **Learning Mode Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/learning-mode.service.ts`):**
  - `// TODO: Track component merges (requires GraphComponentService integration)`
    - This service is pending integration with the `GraphComponentService`.

- **Expert Service (`./hexagon/src_old/_features/assistants/expert/services/expert.service.ts`):**
  - `// TODO: Integrate with full ExpertAgent instantiation via factory pattern.`
  - `// TODO: Create Expert Agent instance via factory`
  - `// TODO: Integrate with ExpertAgent.stream() method`
  - `// TODO: Implement ResearchSession entity and repository`
    - The `ExpertService` is largely a scaffold, with major features like agent instantiation and research session management yet to be implemented.

- **Genius Service (`./hexagon/src_old/_features/assistants/genius/genius.service.ts`):**
  - `// TODO: Get userId from auth context`
    - The service currently lacks the ability to retrieve the user ID from the authentication context.

- **Topics Service (`./hexagon/src_old/_features/assistants/genius/services/topics.service.ts`):**
  - `// TODO: Implement delete in TopicCatalogService`
    - The delete functionality is missing from the `TopicCatalogService`.

- **Escalations Service (`./hexagon/src_old/_features/assistants/genius/services/escalations.service.ts`):**
  - `// TODO: Get from auth context`
    - The service is not yet able to retrieve information from the authentication context.

## 3. Other Findings

- **News Integration Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/news-integration.service.ts`):**
  - `// For now, we'll just note that the article is linked via properties`
  - `// Return empty array for now`
    - The service has placeholder logic and does not yet return actual data.

- **Category Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/category.service.ts`):**
    - `// For now, return the async version result (this should be called in async context)`
        - The service has placeholder logic and does not yet return actual data.

- **Topic Catalog Service (`./hexagon/src_old/_core/infrastructure/agents/components/knowledge/services/topic-catalog.service.ts`):**
    - `// For now, just return topics that need refresh`
    - `// For now, return high-priority unresearched topics`
        - The service has placeholder logic and does not yet return actual data.

- **Kubernetes Network Policy (`./platform/k8s/network-policies/main-node-policy.yaml`):**
  - `# Allow all ingress for now`
    - The main node network policy is currently configured to allow all ingress traffic, which should be reviewed and restricted before production deployment.

- **Git Hooks (`.git/hooks/sendemail-validate.sample`):**
  - The sample git hook contains several `TODO` placeholders for implementing validation checks.
