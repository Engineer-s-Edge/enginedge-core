import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    public readonly error?: string,
  ) {
    super({ message, error }, status);
  }
}
