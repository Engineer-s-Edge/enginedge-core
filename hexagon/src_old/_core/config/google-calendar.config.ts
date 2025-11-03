import { registerAs } from '@nestjs/config';

export default registerAs('googleCalendar', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  // Optional: Path to credentials.json if using service account approach
  credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
}));
