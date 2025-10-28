import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError } from './api.error';

describe('ApiError', () => {
  it('extends HttpException and exposes status, message, and error payload', () => {
    const err = new ApiError('Nope', HttpStatus.BAD_REQUEST, 'BadRequest');
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    const response = err.getResponse() as any;
    expect(response).toEqual({ message: 'Nope', error: 'BadRequest' });
  });

  it('handles optional error field', () => {
    const err = new ApiError('Nope 2', HttpStatus.NOT_FOUND);
    const response = err.getResponse() as any;
    expect(response.message).toBe('Nope 2');
    // When error is omitted, it should be present but undefined
    expect('error' in response).toBe(true);
    expect(response.error).toBeUndefined();
  });
});
