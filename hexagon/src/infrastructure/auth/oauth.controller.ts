import { Controller, Get, Delete, Query, Param, Res } from '@nestjs/common';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';
import { Response } from 'express';

@Controller('oauth')
export class OAuthController {
  constructor(private readonly identity: IdentityClientService) {}

  @Get(':provider/auth')
  @HttpCode(HttpStatus.OK)
  async initiateAuth(@Param('provider') provider: string) {
    const result = await this.identity.oauthAuth(provider);
    // If result contains redirect URL, return it
    if (result.url) {
      return { url: result.url };
    }
    return result;
  }

  @Get(':provider/callback')
  async handleCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state?: string,
    @Res() res?: Response,
  ) {
    const result = await this.identity.oauthCallback(provider, code, state);
    // If result contains redirect URL, redirect to it
    if (result.url && res) {
      return res.redirect(result.url);
    }
    return result;
  }

  @Delete(':provider/unlink')
  @HttpCode(HttpStatus.OK)
  async unlink(
    @Param('provider') provider: string,
    @Query('userId') userId: string,
  ) {
    return this.identity.oauthUnlink(provider, userId);
  }
}
