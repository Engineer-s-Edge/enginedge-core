import { V1ContainerStatus } from '@kubernetes/client-node';

export class PodDto {
  name!: string;
  namespace!: string;
  status!: string;
  nodeName!: string;
  creationTimestamp!: Date;
  labels!: { [key: string]: string };
  annotations!: { [key: string]: string };
  containerStatuses!: V1ContainerStatus[];
}
