const REDACT_KEYS = new Set([
  'password',
  'pass',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'apiKey',
  'apikey',
  'client_secret',
  'secret',
  'cookie',
  'set-cookie',
  'auth',
  'credentials',
]);

export function deepRedact(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => deepRedact(v));
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, v] of Object.entries(value)) {
      if (REDACT_KEYS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = deepRedact(v);
      }
    }
    return result;
  }
  return value;
}

export function shouldRedact(key: string): boolean {
  return REDACT_KEYS.has(key.toLowerCase());
}


