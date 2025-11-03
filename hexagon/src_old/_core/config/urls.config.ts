import { registerAs } from '@nestjs/config';

export default registerAs('urls', () => ({
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/api/google-calendar/auth/callback',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:9090',
  minioEndpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
}));
