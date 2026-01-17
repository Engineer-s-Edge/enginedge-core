import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, createLocalJWKSet } from 'jose';
import axios from 'axios';

@Injectable()
export class JwtService {
  private jwksUrl: string;
  private jwks: any;

  constructor() {
    const baseUrl =
      process.env.IDENTITY_SERVICE_URL || 'http://identity-worker:3000';
    this.jwksUrl = `${baseUrl}/.well-known/jwks.json`;
  }

  private async getJwks() {
    if (!this.jwks) {
      const { data } = await axios.get(this.jwksUrl);
      this.jwks = createLocalJWKSet(data);
    }
    return this.jwks;
  }

  async verify(token: string): Promise<any> {
    try {
      const jwks = await this.getJwks();
      const { payload } = await jwtVerify(token, jwks);
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
