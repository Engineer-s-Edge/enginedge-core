# EnginEdge Hexagon

The central orchestration and API Gateway layer of the EnginEdge platform.

## Overview

The Hexagon serves as both:
- **API Gateway**: Synchronous HTTP routing and proxying to worker services
- **Orchestrator**: Asynchronous Kafka-based workflow orchestration for multi-worker tasks

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- MongoDB, Redis, Kafka (provided via docker-compose)

### Installation

```bash
cd enginedge-core/hexagon
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

## Architecture

The hexagon follows **hexagonal architecture** (ports & adapters):

- **Domain Layer**: Core business logic, entities, domain services
- **Application Layer**: Use cases, application services, ports (interfaces)
- **Infrastructure Layer**: Adapters, repositories, controllers, external integrations

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## API Documentation

See [API.md](./API.md) for complete API reference.

## Workflows

See [WORKFLOWS.md](./WORKFLOWS.md) for workflow examples and patterns.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.

## Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:int

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## Documentation

- [API Documentation](./API.md)
- [Architecture](./ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Workflow Examples](./WORKFLOWS.md)

## Contributing

1. Follow hexagonal architecture principles
2. Domain layer should have no external dependencies
3. Write tests for all layers
4. Update documentation when adding features

## License

UNLICENSED - Proprietary

