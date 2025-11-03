// Jest manual stub for @kubernetes/client-node to avoid ESM parsing and allow per-test overrides
export const KubeConfig: any = jest.fn();

export class CoreV1Api {}
export class AppsV1Api {}

export const Exec: any = jest.fn();

// Minimal type aliases used by the service/tests
export type V1Pod = any;
export type V1Service = any;
export type V1Deployment = any;
