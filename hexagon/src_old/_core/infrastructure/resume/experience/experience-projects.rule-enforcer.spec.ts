import { ExperienceProjectsRuleEnforcer } from '..';
import { ExperienceEntryDto, ProjectEntryDto } from '../dtos/resume.dtos';

describe('ExperienceProjectsRuleEnforcer', () => {
  let enforcer: ExperienceProjectsRuleEnforcer;

  beforeEach(() => {
    enforcer = new ExperienceProjectsRuleEnforcer();
  });

  // Test Suite for Experience Entries
  describe('enforceExperience', () => {
    const createExperienceEntry = (bullets: string[]): ExperienceEntryDto => ({
      title: 'Software Engineer',
      company: 'Tech Corp',
      bullets,
    });

    it('should return no violations for valid experience entries', () => {
      const entries = [
        createExperienceEntry([
          'Developed a feature that increased user engagement by 10%',
        ]),
      ];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toHaveLength(0);
    });
  });

  // Test Suite for Project Entries
  describe('enforceProjects', () => {
    const createProjectEntry = (
      name: string,
      bullets: string[],
    ): ProjectEntryDto => ({
      name,
      tech: ['TypeScript'],
      bullets,
    });

    it('should return no violations for valid project entries', () => {
      const entries = [
        createProjectEntry('My Awesome Project', [
          'Built a tool that reduced deployment time by 50%',
        ]),
      ];
      const { violations } = enforcer.enforceProjects(entries);
      expect(violations).toHaveLength(0);
    });

    it('should flag a non-capitalized project title', () => {
      const entries = [createProjectEntry('my awesome project', [])];
      const { violations } = enforcer.enforceProjects(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'Project[0].Name.NotCapitalized' }),
      );
    });
  });

  // Test Suite for Shared Bullet Logic
  describe('Shared Bullet Logic', () => {
    const createEntry = (bullet: string): ExperienceEntryDto => ({
      title: 'Software Engineer',
      company: 'Tech Corp',
      bullets: [bullet],
    });

    it('should flag a bullet with a trailing period', () => {
      const entries = [createEntry('Fixed a bug.')];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].TrailingPeriod',
        }),
      );
    });

    it('should flag a bullet that is too long', () => {
      const longBullet = 'a'.repeat(151);
      const entries = [createEntry(longBullet)];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'Experience[0].Bullets[0].TooLong' }),
      );
    });

    it('should flag a bullet that starts with a personal pronoun', () => {
      const entries = [createEntry('I wrote a lot of code')];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].HasPronoun',
        }),
      );
    });

    it('should flag a bullet that does not start with a strong action verb', () => {
      const entries = [createEntry('Responsible for testing the application')];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].WeakActionVerb',
        }),
      );
    });

    it('should flag a bullet that is not quantified', () => {
      const entries = [
        createEntry('Improved the performance of the application'),
      ];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].NotQuantified',
        }),
      );
    });

    it('should normalize bullets by removing trailing periods', () => {
      const entries = [createEntry('Fixed a bug.')];
      const { normalizedEntries } = enforcer.enforceExperience(entries);
      expect(normalizedEntries[0].bullets[0]).toBe('Fixed a bug');
    });

    it('should suggest impact-oriented frameworks for non-quantified bullets', () => {
      const entries = [createEntry('Developed a new feature')]; // No metrics
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].NotImpactOriented',
        }),
      );
    });

    it('should not suggest impact-oriented frameworks for quantified bullets', () => {
      const entries = [
        createEntry('Developed a new feature, increasing usage by 20%'),
      ];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).not.toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].NotImpactOriented',
        }),
      );
    });

    it('should not suggest impact-oriented frameworks for bullets with XYZ pattern', () => {
      const entries = [
        createEntry('Accomplished X as measured by Y by doing Z'),
      ];
      const { violations } = enforcer.enforceExperience(entries);
      expect(violations).not.toContainEqual(
        expect.objectContaining({
          rule: 'Experience[0].Bullets[0].NotImpactOriented',
        }),
      );
    });
  });
});
