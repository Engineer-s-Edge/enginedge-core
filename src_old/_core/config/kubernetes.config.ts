import { registerAs } from '@nestjs/config';

export default registerAs('kubernetes', () => {
  const enabled = process.env.KUBERNETES_ENABLED !== 'false';

  return {
    enabled,
    namespace: process.env.KUBERNETES_NAMESPACE || 'default',
  };
});
