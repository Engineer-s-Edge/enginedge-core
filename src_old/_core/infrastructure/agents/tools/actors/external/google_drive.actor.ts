import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, ToolCall } from '../../toolkit.interface';

type DriveOperation = 'list' | 'upload' | 'delete' | 'share' | 'get';

interface GoogleDriveArgs {
  op: DriveOperation;
  fileId?: string;
  name?: string;
  parents?: string[];
  mimeType?: string;
  contentBase64?: string; // for small files
  fields?: string;
  role?: 'reader' | 'writer' | 'commenter' | 'owner';
  type?: 'user' | 'group' | 'domain' | 'anyone';
  emailAddress?: string;
  pageSize?: number;
}

interface GoogleDriveOutput extends ToolOutput {
  data: any;
}

/**
 * Requires env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 */
export class GoogleDriveActor extends BaseActor<
  GoogleDriveArgs,
  GoogleDriveOutput
> {
  _id: ToolIdType = 't_000000000000000000000201' as unknown as ToolIdType;
  name = 'gdrive.actor';
  description =
    'Google Drive operations: list, upload (base64), delete, share, get.';
  useCase = 'Manage files in Google Drive for workflows.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: ['list', 'upload', 'delete', 'share', 'get'],
      },
      fileId: { type: 'string' },
      name: { type: 'string' },
      parents: { type: 'array', items: { type: 'string' } },
      mimeType: { type: 'string' },
      contentBase64: { type: 'string' },
      fields: { type: 'string' },
      role: {
        type: 'string',
        enum: ['reader', 'writer', 'commenter', 'owner'],
      },
      type: { type: 'string', enum: ['user', 'group', 'domain', 'anyone'] },
      emailAddress: { type: 'string' },
      pageSize: { type: 'number', default: 25 },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    { name: 'gdrive.actor', args: { op: 'list', pageSize: 5 } } as ToolCall,
  ];
  retries = 1;
  errorEvent = [
    {
      name: 'GoogleError',
      guidance: 'Verify OAuth credentials and scopes.',
      retryable: true,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private getClient(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.error(
        'Google OAuth credentials missing',
        undefined,
        this.constructor.name,
      );
      throw new Error('Google OAuth credentials missing');
    }

    this.logger.debug('Creating Google OAuth2 client', this.constructor.name);
    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  protected async act(args: GoogleDriveArgs): Promise<GoogleDriveOutput> {
    this.logger.info(
      `Executing Google Drive operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `GoogleDrive args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const auth = this.getClient();
    const drive = google.drive({ version: 'v3', auth });

    switch (args.op) {
      case 'list': {
        this.logger.debug(
          `Listing Google Drive files (pageSize: ${args.pageSize || 25})`,
          this.constructor.name,
        );
        const res = await drive.files.list({
          pageSize: args.pageSize || 25,
          fields:
            'files(id,name,mimeType,owners,emailAddress,webViewLink,webContentLink)' as any,
        });
        this.logger.info(
          `Google Drive list completed: ${res.data.files?.length || 0} files`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data.files || [] } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'get': {
        if (!args.fileId) {
          this.logger.error(
            'fileId required for get operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('fileId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Getting Google Drive file: ${args.fileId}`,
          this.constructor.name,
        );
        const res = await drive.files.get({
          fileId: args.fileId,
          fields: args.fields || '*',
        });
        this.logger.info(
          `Google Drive file retrieved: ${res.data.name}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'upload': {
        if (!args.name || !args.mimeType || !args.contentBase64) {
          this.logger.error(
            'name, mimeType, contentBase64 required for upload operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(
            new Error('name, mimeType, contentBase64 required'),
            { name: 'ValidationError' },
          );
        }
        this.logger.debug(
          `Uploading file to Google Drive: ${args.name} (${args.mimeType})`,
          this.constructor.name,
        );
        const media = {
          mimeType: args.mimeType,
          body: Buffer.from(args.contentBase64, 'base64'),
        } as any;
        const fileMetadata: drive_v3.Schema$File = {
          name: args.name,
          parents: args.parents,
        };
        const res = await drive.files.create({
          requestBody: fileMetadata,
          media,
          fields: 'id,name,mimeType,webViewLink,webContentLink',
        });
        this.logger.info(
          `File uploaded successfully to Google Drive: ${res.data.id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'delete': {
        if (!args.fileId) {
          this.logger.error(
            'fileId required for delete operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('fileId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Deleting Google Drive file: ${args.fileId}`,
          this.constructor.name,
        );
        await drive.files.delete({ fileId: args.fileId });
        this.logger.info(
          `Google Drive file deleted successfully: ${args.fileId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'share': {
        if (!args.fileId || !args.role || !args.type) {
          this.logger.error(
            'fileId, role, type required for share operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('fileId, role, type required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Sharing Google Drive file: ${args.fileId} (${args.role}/${args.type})`,
          this.constructor.name,
        );
        await drive.permissions.create({
          fileId: args.fileId,
          requestBody: {
            role: args.role,
            type: args.type,
            emailAddress: args.emailAddress,
          },
          fields: '*',
        });
        this.logger.info(
          `Google Drive file shared successfully: ${args.fileId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      default:
        this.logger.error(
          `Unsupported Google Drive operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
    }
  }
}

export default GoogleDriveActor;
