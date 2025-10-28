import { IsString, IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';

export class ProvideInputDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  input!: string;
}

export class ProvideApprovalDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsBoolean()
  approved!: boolean;
}
