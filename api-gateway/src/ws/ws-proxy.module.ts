import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { setupWsProxy } from './ws-proxy';

@Module({})
export class WsProxyModule implements OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer?.();
    if (httpServer) {
      await setupWsProxy(httpServer);
    }
  }
}
