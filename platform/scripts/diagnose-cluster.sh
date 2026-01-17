#!/bin/bash
# diagnose-cluster.sh
# Gathers details on failing pods to identify root causes.

echo "==============================================="
echo "CLUSTER DIAGNOSTICS REPORT"
echo "==============================================="
date
echo ""

echo ">>> 1. POD STATUS SUMMARY <<<"
kubectl get pods -o wide
echo ""

echo ">>> 2. RECENT CLUSTER EVENTS (Errors/Warnings) <<<"
kubectl get events --sort-by='.lastTimestamp' | grep -E 'Warning|Failed|Error' | tail -n 20
echo ""

echo ">>> 3. CONFIGURATION ERRORS (CreateContainerConfigError) <<<"
# Extracts the specific missing secret/configmap message
kubectl get pods -o jsonpath='{range .items[?(@.status.containerStatuses[0].state.waiting.reason=="CreateContainerConfigError")]}POD: {.metadata.name}{"\n"}ERROR: {.status.containerStatuses[0].state.waiting.message}{"\n\n"}{end}'

echo ">>> 4. PENDING PODS (Scheduling Issues) <<<"
# Extracts why a pod is Pending (e.g., insufficient cpu/memory, missing PVC)
kubectl get pods -o jsonpath='{range .items[?(@.status.phase=="Pending")]}POD: {.metadata.name}{"\n"}REASON: {.status.conditions[?(@.type=="PodScheduled")].message}{"\n\n"}{end}'

echo ">>> 5. CRASHING PODS (Error/CrashLoopBackOff) <<<"
echo "--- agent-tool-worker logs ---"
kubectl logs -l component=agent-tool-worker --tail=20 --previous 2>/dev/null || kubectl logs -l component=agent-tool-worker --tail=20 2>/dev/null || echo "No logs found."
echo ""

echo ">>> 6. STUCK INIT CONTAINERS (Waiting for Dependencies) <<<"
echo "--- kafka-topics-init (wait-for-kafka) ---"
kubectl logs -l app=kafka-topics-init -c wait-for-kafka --tail=10 2>/dev/null || echo "No logs found."
echo ""
echo "--- interview-worker (wait-for-kafka) ---"
kubectl logs -l component=interview-worker -c wait-for-kafka --tail=10 2>/dev/null || echo "No logs found."
echo ""

echo ">>> 7. CONTAINER CREATING (Mount/Pull Issues) <<<"
# Check one example of ContainerCreating to see if it's pulling or mounting
echo "--- data-processing-worker events ---"
kubectl describe pod -l component=data-processing-worker | grep -A 20 "Events:"
