export class DeploymentDto {
  name!: string;
  namespace!: string;
  replicas!: number;
  readyReplicas!: number;
  creationTimestamp!: Date;
  labels!: { [key: string]: string };
}
