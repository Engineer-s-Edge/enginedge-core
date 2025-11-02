# Kafka Lag — Potential Causes (codebase scan)

Date: 2025-10-28

This document summarizes potential sources of Kafka consumer lag discovered by scanning the repository for Kafka usage (producers, consumers, topic config, and adapters). It collects evidence (file references), prioritized likely causes, and a concrete investigation checklist. This file intentionally excludes any mapping of fixes — it contains only the findings and investigative steps.

## One-line summary
Multiple likely causes of Kafka lag were identified: shared generic consumer groups across services, auto-created / single-partition topics, sequential long-running `eachMessage` handlers, transactional producer/backpressure and retries, and aggressive heartbeats or inconsistent heartbeat/session settings.

## Evidence (representative file locations)
- Topic configuration / topic names:
  - `enginedge-core/src_old/_core/config/kafka.config.ts` (topics: `calendar-events`, `ml-pipeline-triggers`, `calendar-predictions`, `user-activity`, `commands`, `results`, `worker-status`).
  - `_enginedge-monorepo/main-node/src/core/config/kafka.config.ts` (same topic list).

- Consumer group usage (shared or generic `groupId`):
  - `enginedge-workers/worker-template/src/infrastructure/adapters/messaging/kafka-message-broker.adapter.ts` — `this.consumer = this.kafka.consumer({ groupId: 'worker-group' });`
  - `enginedge-workers/latex-worker/src/infrastructure/adapters/messaging/kafka-message-broker.adapter.ts` — uses `worker-group` pattern.
  - Many workers show similar patterns (`rnle-worker`, `scheduling-worker`, `interview-worker`, `agent-tool-worker`, `worker-node`, `assistant-worker`) — grep hits show repeated use of `'worker-group'` or similar.

- Auto-topic creation and transactional producers:
  - `enginedge-core/src_old/_core/infrastructure/kafka/kafka-config.service.ts` — `allowAutoTopicCreation: true` appears in config.
  - `enginedge-workers/latex-worker/...` — producer config includes `allowAutoTopicCreation: true` and `transactionalId: `${clientId}-producer``.

- Consumer processing pattern (sequential per-partition handlers):
  - Multiple adapters use `consumer.run({ eachMessage: async ({ topic, partition, message }) => { ... } })` (examples: worker-template, scheduling-worker, rnle-worker, data-processing-worker).
  - Handler code executes heavy work paths: document processing (`data-processing-worker`), ML/prediction/scheduling flows (`scheduling-worker` / main-node handlers), and external compute (Wolfram/local kernel via `enginedge-local-kernel/app.py`).

- Heartbeat and timing settings (inconsistent / frequent):
  - `heartbeatInterval: 3000` appears in `kafka-config.service.ts` and several worker files/tests (grep hits).
  - Some docs mention `heartbeatFrequencyMS: 10000` for scheduling-worker — there is inconsistency across files.

- Producer usage (send calls):
  - `await this.producer.send({ ... })` used in `worker-node/src/services/kafka.service.ts`, `interview-worker/src/services/kafka.service.ts`, `agent-tool-worker` and many other producers.

## Prioritized likely causes (with reasoning)
1. Consumers sharing the same generic `groupId` across different worker types
   - Reason: unrelated services compete for partitions and cause partition skew or frequent rebalances.
   - Evidence: repeated `groupId: 'worker-group'` across multiple worker adapters.

2. Auto-created topics with default single partition
   - Reason: `allowAutoTopicCreation: true` can let the broker create topics with default partition count (often 1), preventing parallel consumption and creating a single hot partition.
   - Evidence: `allowAutoTopicCreation: true` found in kafka config and adapters.

3. Sequential per-partition processing in `eachMessage` handlers that perform long-running work
   - Reason: kafkajs runs `eachMessage` sequentially per partition; heavy CPU / blocking I/O (document processing, ML calls, compute requests) will cause backlog on that partition.
   - Evidence: `consumer.run({ eachMessage: ... })` in many adapters; heavy work paths (document processing, ML, external compute via local kernel).

4. Transactional producers and aggressive retry/backoff leading to producer-side backpressure
   - Reason: transactions require coordination; long retries or blocked transactions can slow throughput and increase latency.
   - Evidence: `transactionalId` present for some producers and `retry` config in Kafka initialization.

5. Frequent heartbeats and inconsistent session/heartbeat settings across clients
   - Reason: many instances with aggressive heartbeat intervals increase controller load; mismatched sessionTimeouts or frequent reconnects cause rebalances that pause consumption.
   - Evidence: `heartbeatInterval` set to 3000ms in multiple places; docs show other values.

6. Retries and DLQ accumulation
   - Reason: messages failing processing and being retried or sent to DLQ can create backpressure, large backlogs, and repeated re-injections if reprocessing is automatic.
   - Evidence: retry logic and DLQ patterns referenced in adapter docs (assistant-worker) and tests.

7. Possible offset commit handling issues
   - Reason: relying on defaults or failing to handle exceptions may prevent offsets from being committed, causing re-delivery and perceived lag.
   - Evidence: `eachMessage` use and reliance on kafkajs defaults; no explicit commit handling surfaced by the scan (this is a risk to validate).

## Concrete investigation checklist (do these read-only checks first)
1. Confirm partition counts and replication for critical topics:
   - Target topics: `commands`, `user-activity`, `results`, `worker-status`, `calendar-events`.
   - Command (example): `kafka-topics.sh --bootstrap-server <broker> --describe --topic commands`.

2. Inspect consumer groups and per-partition lag:
   - Run: `kafka-consumer-groups.sh --bootstrap-server <broker> --describe --group worker-group` and for other groups such as `assistant-worker-group`, `data-processing-worker-group`, `rnle-worker-group`.

3. Map `groupId` usage across code to determine intentional sharing vs misconfiguration:
   - Grep for `consumer({ groupId:` across the repo and review which services share the same id.

4. Measure per-message processing time in `eachMessage` handlers:
   - Temporarily enable timing logs or use existing metrics; collect avg and p99 processing times for handlers that perform heavy work (document processing, ML calls, external kernel calls).

5. Inspect producer error/retry logs and transaction coordinator logs:
   - Look for repeated send failures, transaction timeouts, or long retry chains.

6. Check broker logs for frequent rebalances and controller activity:
   - Look for GroupCoordinator and rebalance entries which indicate churn.

7. Inspect DLQ topics and size:
   - If a DLQ exists, inspect message counts, timestamps, and patterns; identify if automated reprocessing is causing spikes.

8. Verify heartbeat / sessionTimeout configuration consistency:
   - Confirm `heartbeatInterval` and `sessionTimeout` values across `kafka-config.service.ts` and worker adapters.

## Files to inspect first (quick list)
- `enginedge-workers/worker-template/src/infrastructure/adapters/messaging/kafka-message-broker.adapter.ts` — consumer pattern and subscription.
- `enginedge-workers/latex-worker/src/infrastructure/adapters/messaging/kafka-message-broker.adapter.ts` — transactional producer and `allowAutoTopicCreation`.
- `enginedge-workers/data-processing-worker/src/infrastructure/adapters/messaging/kafka-data-processing.adapter.ts` — heavy document processing flows.
- `enginedge-core/src_old/_core/infrastructure/kafka/kafka-config.service.ts` — global kafka defaults (`allowAutoTopicCreation`, `heartbeatInterval`).
- `enginedge-local-kernel/app.py` — external heavy compute path using Kafka (compute requests/responses).
- `worker-node/src/services/kafka.service.ts` and `interview-worker/src/services/kafka.service.ts` — examples of `producer.send` usage.

## Quick non-invasive checks (commands you can run in your Kafka environment)
```pwsh
# Describe topic partitions
kafka-topics.sh --bootstrap-server <broker:9092> --describe --topic commands

# Describe a consumer group's lag
kafka-consumer-groups.sh --bootstrap-server <broker:9092> --describe --group worker-group

# (Optional) List all consumer groups
kafka-consumer-groups.sh --bootstrap-server <broker:9092> --list
```

## Closing notes
- This file contains findings and an investigation checklist only; no fixes were applied.
- The highest-probability root causes are (1) shared/generic consumer groups and (2) topics with too few partitions (often caused by auto-creation). Sequential heavy handlers (3) are also a common bottleneck and should be measured.
- For deterministic next steps, run the `kafka-topics.sh` and `kafka-consumer-groups.sh` checks above, and confirm the `groupId` mapping in the code (grep for `consumer({ groupId:`).

---
Generated by codebase scan on 2025-10-28
