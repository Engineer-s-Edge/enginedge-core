import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { jwtVerify, createLocalJWKSet } from 'jose';
import axios from 'axios';

let jwksCache: ReturnType<typeof createLocalJWKSet> | null = null;
let jwksFetchPromise: Promise<void> | null = null;

async function getJwks(): Promise<ReturnType<typeof createLocalJWKSet>> {
  // Return cached JWKS if available
  if (jwksCache) {
    return jwksCache;
  }

  // If a fetch is already in progress, wait for it
  if (jwksFetchPromise) {
    await jwksFetchPromise;
    if (jwksCache) {
      return jwksCache;
    }
  }

  // Start a new fetch
  jwksFetchPromise = (async () => {
    try {
      const baseUrl =
        process.env.IDENTITY_SERVICE_URL || 'http://identity-worker:3000';
      const { data } = await axios.get(`${baseUrl}/.well-known/jwks.json`, {
        timeout: 5000,
      });
      jwksCache = createLocalJWKSet(data);
    } catch (error: any) {
      console.warn(
        `[WsProxy] Failed to fetch JWKS from identity service: ${error.message}. ` +
          `WebSocket connections will be rejected until identity service is available.`,
      );
      // Don't cache on error, allow retry on next connection attempt
      throw error;
    } finally {
      jwksFetchPromise = null;
    }
  })();

  await jwksFetchPromise;

  if (!jwksCache) {
    throw new Error('Failed to fetch JWKS');
  }

  return jwksCache;
}

function pickHeaders(headers: any) {
  const allowed = [
    'authorization',
    'sec-websocket-protocol',
    'x-request-id',
    'x-correlation-id',
    'traceparent',
    'tracestate',
  ];
  const out: any = {};
  for (const k of allowed) if (headers[k]) out[k] = headers[k];
  return out;
}

export async function setupWsProxy(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req: IncomingMessage, socket, head) => {
    const url = req.url || '';
    const routes = [
      {
        prefixes: ['/api/assistants', '/assistants'],
        base:
          process.env.ASSISTANT_WORKER_URL || 'http://assistant-worker:3001',
      },
      {
        prefixes: ['/api/interview', '/interview'],
        base:
          process.env.INTERVIEW_WORKER_URL || 'http://interview-worker:3004',
      },
      {
        prefixes: ['/api/data', '/data'],
        base:
          process.env.DATA_WORKER_URL || 'http://data-processing-worker:3003',
      },
      {
        prefixes: ['/api/resume', '/resume'],
        base: process.env.RESUME_WORKER_URL || 'http://resume-worker:3006',
      },
      {
        prefixes: [
          '/api/scheduling',
          '/scheduling',
          '/api/calendar',
          '/calendar',
        ],
        base:
          process.env.SCHEDULING_WORKER_URL || 'http://scheduling-worker:3000',
      },
      {
        prefixes: ['/api/latex', '/latex'],
        base: process.env.LATEX_WORKER_URL || 'http://latex-worker:3005',
      },
      {
        prefixes: ['/api/tools', '/tools'],
        base: process.env.TOOLS_WORKER_URL || 'http://agent-tool-worker:3002',
      },
    ];
    const match = routes.find((r) => r.prefixes.some((p) => url.startsWith(p)));
    if (!match) return; // not a managed ws route

    try {
      const auth = (req.headers['authorization'] as string) || '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice(7)
        : new URLSearchParams(url.split('?')[1] || '').get('token') || '';
      if (!token) throw new Error('missing token');

      // Lazy load JWKS - only fetch when first WebSocket connection is attempted
      const jwks = await getJwks();
      await jwtVerify(token, jwks);
    } catch (error: any) {
      // If JWKS fetch failed, reject connection
      if (
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('ECONNREFUSED')
      ) {
        console.warn(
          `[WsProxy] Identity service unavailable, rejecting WebSocket connection to ${url}`,
        );
      }
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket as any, head, (wsClient: WebSocket) => {
      const base = match.base.replace(/^http:\/\//, '');
      const targetUrl = `ws://${base}${url.replace(/^\/api/, '')}`;
      const wsTarget = new WebSocket(targetUrl, {
        headers: pickHeaders(req.headers),
      });

      wsClient.on(
        'message',
        (data) => wsTarget.readyState === WebSocket.OPEN && wsTarget.send(data),
      );
      wsTarget.on(
        'message',
        (data) => wsClient.readyState === WebSocket.OPEN && wsClient.send(data),
      );
      wsTarget.on('close', () => wsClient.close());
      wsClient.on('close', () => wsTarget.close());
      wsTarget.on('error', () => wsClient.close());
      wsClient.on('error', () => wsTarget.close());
    });
  });
}
