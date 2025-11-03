import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';

@Injectable()
export class JwtService {
  private secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');

  async verify(token: string): Promise<any> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
