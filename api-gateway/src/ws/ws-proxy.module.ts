import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { setupWsProxy } from './ws-proxy';

@Module({})
export class WsProxyModule implements OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer?.();
    if (httpServer) {
      try {
        await setupWsProxy(httpServer);
        console.log('[WsProxy] WebSocket proxy initialized');
      } catch (error: any) {
        // Don't crash the app if WebSocket proxy setup fails
        // It will be retried when the first WebSocket connection is attempted
        console.warn(
          `[WsProxy] Failed to initialize WebSocket proxy: ${error.message}`,
        );
      }
    }
  }
}
