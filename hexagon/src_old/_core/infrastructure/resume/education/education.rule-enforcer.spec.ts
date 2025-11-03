import { EducationRuleEnforcer } from '..';
import { EducationEntryDto } from '../dtos/resume.dtos';

describe('EducationRuleEnforcer', () => {
  let enforcer: EducationRuleEnforcer;

  beforeEach(() => {
    enforcer = new EducationRuleEnforcer();
  });

  const createEducationEntry = (
    overrides: Partial<EducationEntryDto> = {},
  ): EducationEntryDto => ({
    institution: 'State University',
    degree: 'B.S. in Computer Science',
    gradYear: 2022,
    ...overrides,
  });

  it('should return no violations for a valid set of entries', () => {
    const entries = [
      createEducationEntry({ gradYear: 2022 }),
      createEducationEntry({
        institution: 'Community College',
        degree: 'A.S.',
        gradYear: 2020,
      }),
    ];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toHaveLength(0);
  });

  it('should flag GPA scale below 3.75', () => {
    const entries = [
      createEducationEntry({ gpaValue: 3.74, gpaType: 'scale' }),
    ];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Education[0].Gpa.TooLow' }),
    );
  });

  it('should normalize GPA scale to two decimal places', () => {
    const entries = [
      createEducationEntry({ gpaValue: 3.857, gpaType: 'scale' }),
    ];
    const { normalizedEntries } = enforcer.enforce(entries);
    expect(normalizedEntries[0].gpaValue).toBe(3.86);
  });

  it('should flag GPA percentage below 80%', () => {
    const entries = [
      createEducationEntry({ gpaValue: 79, gpaType: 'percentage' }),
    ];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Education[0].Gpa.TooLow' }),
    );
  });

  it('should not flag GPA percentage at or above 80%', () => {
    const entries = [
      createEducationEntry({ gpaValue: 80, gpaType: 'percentage' }),
    ];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toHaveLength(0);
  });

  it('should flag GPA for experienced professionals', () => {
    const entries = [createEducationEntry({ gpaValue: 4.0 })];
    const { violations } = enforcer.enforce(entries, true); // isExperienced = true
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: 'Education[0].Gpa.ExperiencedProfessional',
      }),
    );
  });

  it('should flag excessive coursework', () => {
    const entries = [
      createEducationEntry({
        coursework: [
          'Intro to C',
          'Data Structures',
          'Algorithms',
          'OS',
          'Compilers',
          'AI',
        ],
      }),
    ];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Education[0].Coursework.TooLong' }),
    );
  });

  it('should sort entries in reverse-chronological order', () => {
    const entries = [
      createEducationEntry({ gradYear: 2020, gradMonth: 5 }),
      createEducationEntry({ gradYear: 2022, gradMonth: 12 }),
      createEducationEntry({ gradYear: 2020, gradMonth: 12 }),
    ];
    const { normalizedEntries } = enforcer.enforce(entries);
    expect(
      normalizedEntries.map((e) => `${e.gradYear}-${e.gradMonth || 0}`),
    ).toEqual(['2022-12', '2020-12', '2020-5']);
  });

  it('should flag missing institution', () => {
    const entries = [createEducationEntry({ institution: '  ' })];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Education[0].Institution.Required' }),
    );
  });

  it('should flag missing degree', () => {
    const entries = [createEducationEntry({ degree: '' })];
    const { violations } = enforcer.enforce(entries);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Education[0].Degree.Required' }),
    );
  });
});
