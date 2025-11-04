# Hexagonal Architecture Violations

## 1. `main.ts`
- **Violation**: The `main.ts` file directly imports and executes `setupWsProxy` from the `infrastructure` layer.
- **Reason**: This creates a hard coupling between the application's entry point and the infrastructure layer, violating the dependency rule. The application should not be aware of the specific implementation details of the infrastructure.

- **Violation**: The `/metrics` endpoint is implemented inline in the `main.ts` file.
- **Reason**: This clutters the bootstrap file with logic that should be encapsulated in a dedicated module. This also makes it more difficult to test and maintain the metrics endpoint.

## 2. `app.module.ts`
- **Violation**: The `AppModule` directly imports and is tightly coupled with infrastructure-level modules, without a clear, independent application core module.
- **Reason**: A core principle of hexagonal architecture is that the application core should be independent of infrastructure details. However, in this file, the application is assembled entirely from infrastructure modules. There is no `ApplicationModule` being imported, which suggests a lack of a distinct, decoupled application layer.

## 3. `application` directory
- **Violation**: The `WorkflowOrchestrationService` contains a `getWorkflowSteps` method that hardcodes business logic for defining workflow steps.
- **Reason**: This logic should be externalized to the domain layer, as it represents core business rules that should be independent of application-level concerns. By embedding this logic in an application service, the architecture creates a tight coupling between the application and domain, reducing the domain's reusability and making it more difficult to modify business rules without altering application code.

## 4. `domain` directory
- **Violation**: The `RequestRouter` domain service is using the `@Injectable()` decorator from `@nestjs/common`, which introduces a direct dependency on the NestJS framework.
- **Reason**: This violates the principle that the domain layer should be completely independent of any external frameworks or libraries.

- **Violation**: The `RequestRouter` also contains hardcoded business logic for routing requests and assigning workers, which should be externalized to a separate, more configurable component.
- **Reason**: This tight coupling of business logic within the domain service makes it difficult to modify or extend the routing rules without changing the core domain code.
