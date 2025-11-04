import { Controller, Get } from '@nestjs/common';
import axios from 'axios';

@Controller('.well-known')
export class JwksController {
  @Get('jwks.json')
  async getJwks() {
    const baseUrl = process.env.IDENTITY_SERVICE_URL || 'http://identity-worker:3000';
    const { data } = await axios.get(`${baseUrl}/.well-known/jwks.json`);
    return data;
  }
}

