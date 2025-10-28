import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

interface GDriveRetrieveArgs {
  query?: string; // q param for drive.files.list
  pageSize?: number;
  fields?: string;
}

interface GDriveRetrieveOutput extends ToolOutput {
  data: any;
}

export class GoogleDriveRetriever extends BaseRetriever<
  GDriveRetrieveArgs,
  GDriveRetrieveOutput
> {
  _id: ToolIdType = 't_000000000000000000000303' as unknown as ToolIdType;
  name = 'gdrive.retrieve';
  description = 'Retrieve files metadata from Google Drive via files.list.';
  useCase = 'Search and list files from Google Drive.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 25,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string' },
      pageSize: { type: 'number' },
      fields: { type: 'string' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'gdrive.retrieve',
      args: { query: "name contains 'report'" },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private getClient(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.error(
        'Google OAuth credentials missing for Drive',
        undefined,
        this.constructor.name,
      );
      throw new Error('Google OAuth credentials missing');
    }

    this.logger.debug(
      'Creating Google Drive OAuth2 client',
      this.constructor.name,
    );
    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  protected async retrieve(
    args: GDriveRetrieveArgs & { ragConfig: RAGConfig },
  ): Promise<GDriveRetrieveOutput> {
    this.logger.info(
      `Retrieving Google Drive files with query: ${args.query || 'no query'}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Google Drive args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    try {
      const auth = this.getClient();
      const drive = google.drive({ version: 'v3', auth });

      const listOptions = {
        q: args.query,
        pageSize: args.pageSize || args.ragConfig.top_k || 25,
        fields:
          args.fields ||
          'files(id,name,mimeType,webViewLink,modifiedTime,owners)',
      };

      this.logger.debug(
        `Drive list options: ${JSON.stringify(listOptions)}`,
        this.constructor.name,
      );
      this.logger.debug(
        'Fetching files from Google Drive API',
        this.constructor.name,
      );

      const res = await drive.files.list(listOptions);
      this.logger.info(
        `Google Drive files retrieved: ${res.data.files?.length || 0} files`,
        this.constructor.name,
      );
      this.logger.debug(
        `Query: ${args.query || 'none'}, pageSize: ${listOptions.pageSize}`,
        this.constructor.name,
      );

      return {
        data: { ok: true, data: res.data.files || [] } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Google Drive retrieval failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default GoogleDriveRetriever;
