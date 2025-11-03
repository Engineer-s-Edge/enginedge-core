export class CalendarEventDto {
  summary!: string;
  description?: string;
  location?: string;
  start!: {
    dateTime: string;
    timeZone?: string;
  };
  end!: {
    dateTime: string;
    timeZone?: string;
  };
  colorId?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}
