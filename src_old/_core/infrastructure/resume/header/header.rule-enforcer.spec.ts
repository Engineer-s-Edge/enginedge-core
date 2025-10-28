import { HeaderRuleEnforcer } from '..';
import { HeaderDto } from '../dtos/resume.dtos';

describe('HeaderRuleEnforcer', () => {
  let enforcer: HeaderRuleEnforcer;

  beforeEach(() => {
    enforcer = new HeaderRuleEnforcer();
  });

  const createDefaultHeader = (): HeaderDto => ({
    fullName: 'John Doe',
    email: 'john.doe@example.com',
    phone: '(123) 456-7890',
    location: 'New York, NY',
    links: ['github.com/johndoe', 'linkedin.com/in/johndoe'],
  });

  it('should return no violations for a valid header', () => {
    const header = createDefaultHeader();
    const { violations } = enforcer.enforce(header);
    expect(violations).toHaveLength(0);
  });

  it('should detect a missing full name', () => {
    const header = createDefaultHeader();
    header.fullName = '';
    const { violations } = enforcer.enforce(header);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Header.FullName.Required' }),
    );
  });

  it('should detect a full name in all caps', () => {
    const header = createDefaultHeader();
    header.fullName = 'JOHN DOE';
    const { violations } = enforcer.enforce(header);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Header.FullName.AllCaps' }),
    );
  });

  it('should remove "Email:" label and report violation', () => {
    const header = createDefaultHeader();
    header.email = 'Email: john.doe@example.com';
    const { normalizedHeader, violations } = enforcer.enforce(header);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Header.Email.Label' }),
    );
    expect(normalizedHeader.email).toBe('john.doe@example.com');
  });

  it('should normalize a 10-digit phone number and strip labels', () => {
    const header = createDefaultHeader();
    header.phone = 'Phone: 123-456-7890';
    const { normalizedHeader, violations } = enforcer.enforce(header);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Header.Phone.Label' }),
    );
    expect(normalizedHeader.phone).toBe('(123) 456-7890');
  });

  it('should detect an invalid phone number format', () => {
    const header = createDefaultHeader();
    header.phone = '123-456';
    const { violations } = enforcer.enforce(header);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Header.Phone.Format' }),
    );
  });

  it('should detect an invalid location format', () => {
    const header = createDefaultHeader();
    header.location = 'New York';
    const { violations } = enforcer.enforce(header);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Header.Location.Format' }),
    );
  });

  it('should deduplicate, normalize, and sort links', () => {
    const header = createDefaultHeader();
    header.links = [
      'https://www.linkedin.com/in/johndoe',
      'https://github.com/johndoe',
      'https://www.linkedin.com/in/johndoe', // duplicate
      'my-portfolio.com',
    ];
    const { normalizedHeader } = enforcer.enforce(header);
    expect(normalizedHeader.links).toEqual([
      'github.com/johndoe',
      'my-portfolio.com',
      'linkedin.com/in/johndoe',
    ]);
  });
});
