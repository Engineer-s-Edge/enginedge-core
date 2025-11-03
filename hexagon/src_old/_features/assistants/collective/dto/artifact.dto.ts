import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateArtifactDto {
  @IsString()
  collectiveId!: string;

  @IsString()
  taskId!: string;

  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  content!: string;

  @IsString()
  createdBy!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateArtifactDto {
  @IsString()
  artifactId!: string;

  @IsString()
  agentId!: string;

  @IsString()
  content!: string;
}

export class LockArtifactDto {
  @IsString()
  artifactId!: string;

  @IsString()
  agentId!: string;
}

export class UnlockArtifactDto {
  @IsString()
  artifactId!: string;

  @IsString()
  agentId!: string;
}

export class SearchArtifactsDto {
  @IsString()
  collectiveId!: string;

  @IsString()
  query!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ArtifactResponseDto {
  id!: string;
  collectiveId!: string;
  taskId!: string;
  name!: string;
  type!: string;
  description?: string;
  content!: string;
  version!: number;
  previousVersionId?: string;
  lockedBy?: string;
  lockedAt?: Date;
  createdBy!: string;
  tags!: string[];
  createdAt!: Date;
  updatedAt!: Date;
}
