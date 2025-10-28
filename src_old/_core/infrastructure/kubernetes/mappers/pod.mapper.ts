import { V1Pod } from '@kubernetes/client-node';
import { PodDto } from '../dtos/pod.dto';

export class PodMapper {
  static toDto(pod: V1Pod): PodDto {
    return {
      name: pod.metadata?.name || '',
      namespace: pod.metadata?.namespace || '',
      status: pod.status?.phase || '',
      nodeName: pod.spec?.nodeName || '',
      creationTimestamp: pod.metadata?.creationTimestamp || new Date(),
      labels: pod.metadata?.labels || {},
      annotations: pod.metadata?.annotations || {},
      containerStatuses: pod.status?.containerStatuses || [],
    };
  }
}
