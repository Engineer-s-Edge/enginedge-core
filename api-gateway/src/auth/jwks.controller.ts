import { Controller, Get } from '@nestjs/common';

@Controller('.well-known')
export class JwksController {
  @Get('jwks.json')
  getJwks() {
    return { keys: [] };
  }
}


