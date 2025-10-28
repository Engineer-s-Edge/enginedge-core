import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

@Injectable()
export class GoogleAuthService {
  private oAuth2Client!: OAuth2Client;

  constructor(
    private configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    this.initializeOAuth2Client();
  }

  private initializeOAuth2Client(): void {
    const clientId = this.configService.get<string>('googleCalendar.clientId');
    const clientSecret = this.configService.get<string>(
      'googleCalendar.clientSecret',
    );
    const redirectUri =
      this.configService.get<string>('googleCalendar.redirectUri') ||
      this.configService.get<string>('urls.googleRedirectUri');

    if (!clientId || !clientSecret) {
      this.logger.warn(
        'Missing Google OAuth credentials. Some features may not work properly.',
        GoogleAuthService.name,
      );
      return;
    }

    this.oAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
    const refreshToken = this.configService.get<string>(
      'googleCalendar.refreshToken',
    );
    if (refreshToken) {
      this.oAuth2Client.setCredentials({ refresh_token: refreshToken });
    }
  }

  generateAuthUrl(): string {
    const scopes = this.configService.get<string[]>('googleCalendar.scopes');
    return this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  async getTokenFromCode(code: string): Promise<any> {
    try {
      const { tokens } = await this.oAuth2Client.getToken(code);
      this.oAuth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error getting token from code: ${info.message}`,
        info.stack,
        GoogleAuthService.name,
      );
      // If Google API provided a structured error response, log a safe summary
      const anyErr: any = error as any;
      if (anyErr && anyErr.response && anyErr.response.data) {
        try {
          this.logger.error(
            `OAuth error response: ${JSON.stringify(anyErr.response.data)}`,
            undefined,
            GoogleAuthService.name,
          );
        } catch {
          // ignore JSON stringify issues
        }
      }
      throw error;
    }
  }

  setCredentials(tokens: any): void {
    this.oAuth2Client.setCredentials(tokens);
  }

  createAuthenticatedClient(tokens: any): OAuth2Client {
    const clientId = this.configService.get<string>('googleCalendar.clientId');
    const clientSecret = this.configService.get<string>(
      'googleCalendar.clientSecret',
    );
    const redirectUri =
      this.configService.get<string>('googleCalendar.redirectUri') ||
      this.configService.get<string>('urls.googleRedirectUri');

    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    client.setCredentials(tokens);
    return client;
  }

  getOAuth2Client(): OAuth2Client {
    return this.oAuth2Client;
  }
}
