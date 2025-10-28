import { registerAs } from '@nestjs/config';

export default registerAs('scheduling', () => ({
  defaultWorkingHours: {
    start: process.env.DEFAULT_WORKING_HOURS_START || '09:00',
    end: process.env.DEFAULT_WORKING_HOURS_END || '18:00',
  },
}));
