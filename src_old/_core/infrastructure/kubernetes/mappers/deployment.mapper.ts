import { V1Deployment } from '@kubernetes/client-node';
import { DeploymentDto } from '../dtos/deployment.dto';

export class DeploymentMapper {
  static toDto(deployment: V1Deployment): DeploymentDto {
    return {
      name: deployment.metadata?.name || '',
      namespace: deployment.metadata?.namespace || '',
      replicas: deployment.spec?.replicas || 0,
      readyReplicas: deployment.status?.readyReplicas || 0,
      creationTimestamp: deployment.metadata?.creationTimestamp || new Date(),
      labels: deployment.metadata?.labels || {},
    };
  }
}
