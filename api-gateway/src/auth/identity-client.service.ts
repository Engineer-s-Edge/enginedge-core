import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class IdentityClientService {
  private baseUrl = process.env.IDENTITY_SERVICE_URL || 'http://identity-worker:3000';

  async login(email: string, password: string) {
    const { data } = await axios.post(`${this.baseUrl}/internal/auth/login`, { email, password });
    return data;
  }

  async register(payload: any) {
    const { data } = await axios.post(`${this.baseUrl}/internal/auth/register`, payload);
    return data;
  }

  async refresh(refreshToken: string) {
    const { data } = await axios.post(`${this.baseUrl}/internal/auth/token/refresh`, { refreshToken });
    return data;
  }

  async revoke(refreshToken: string) {
    const { data } = await axios.post(`${this.baseUrl}/internal/auth/token/revoke`, { refreshToken });
    return data;
  }
}


