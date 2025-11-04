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
    const { data } = await axios.post(`${this.baseUrl}/internal/auth/token/refresh`, {
      refreshToken,
    });
    return data;
  }

  async revoke(refreshToken: string) {
    const { data } = await axios.post(`${this.baseUrl}/internal/auth/token/revoke`, {
      refreshToken,
    });
    return data;
  }

  async profile(userId: string) {
    const { data } = await axios.get(`${this.baseUrl}/internal/auth/profile`, {
      headers: { 'X-User-Id': userId },
    });
    return data;
  }

  async getUserById(id: string) {
    const { data } = await axios.get(`${this.baseUrl}/internal/users/${id}`);
    return data;
  }

  async getUserByEmail(email: string) {
    const { data } = await axios.get(`${this.baseUrl}/internal/users`, { params: { email } });
    return data;
  }

  async updateUser(id: string, payload: any) {
    const { data } = await axios.patch(`${this.baseUrl}/internal/users/${id}`, payload);
    return data;
  }

  async createUser(payload: any) {
    const { data } = await axios.post(`${this.baseUrl}/internal/users`, payload);
    return data;
  }

  async deleteUser(id: string) {
    const { data } = await axios.delete(`${this.baseUrl}/internal/users/${id}`);
    return data;
  }

  async oauthAuth(provider: string) {
    const { data } = await axios.get(`${this.baseUrl}/internal/oauth/${provider}/auth`);
    return data;
  }

  async oauthCallback(provider: string, code: string, state?: string) {
    const { data } = await axios.get(`${this.baseUrl}/internal/oauth/${provider}/callback`, {
      params: { code, state },
    });
    return data;
  }

  async oauthUnlink(provider: string, userId: string) {
    const { data } = await axios.delete(`${this.baseUrl}/internal/oauth/${provider}/unlink`, {
      params: { userId },
    });
    return data;
  }
}

