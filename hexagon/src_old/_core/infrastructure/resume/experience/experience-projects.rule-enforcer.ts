import { Injectable } from '@nestjs/common';
import {
  ExperienceEntryDto,
  ProjectEntryDto,
  RuleViolation,
} from '../dtos/resume.dtos';

// A non-exhaustive list of strong action verbs.
const STRONG_ACTION_VERBS = [
  'developed',
  'led',
  'managed',
  'created',
  'implemented',
  'designed',
  'architected',
  'built',
  'optimized',
  'improved',
  'increased',
  'reduced',
  'achieved',
  'launched',
  'negotiated',
  'streamlined',
  'automated',
  'mentored',
  'trained',
  'presented',
  'published',
  'researched',
  'applied',
  'assembled',
  'calculated',
  'computed',
  'constructed',
  'engineered',
  'fabricated',
  'installed',
  'maintained',
  'operated',
  'programmed',
  'remodeled',
  'repaired',
  'solved',
  'upgraded',
  'completed',
  'exceeded',
  'pioneered',
  'resolved',
  'restored',
  'succeeded',
  'surpassed',
  'administered',
  'appointed',
  'approved',
  'assigned',
  'authorized',
  'chaired',
  'controlled',
  'coordinated',
  'delegated',
  'directed',
  'executed',
  'headed',
  'hired',
  'merged',
  'organized',
  'oversaw',
  'presided',
  'prioritized',
  'recommended',
  'reviewed',
  'scheduled',
  'selected',
  'supervised',
];

@Injectable()
export class ExperienceProjectsRuleEnforcer {
  private enforceBullets(
    bullets: string[],
    entryIndex: number,
    entryType: 'Experience' | 'Project',
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];

    bullets.forEach((bullet: string, bulletIndex: number) => {
      let normalizedBullet = bullet.trim();

      // Rule: No trailing periods
      if (normalizedBullet.endsWith('.')) {
        normalizedBullet = normalizedBullet.slice(0, -1);
        violations.push({
          rule: `${entryType}[${entryIndex}].Bullets[${bulletIndex}].TrailingPeriod`,
          message: 'Bullet points should not end with a period.',
          suggestion: `Remove the trailing period from: "${bullet}"`,
        });
      }

      // Rule: Keep bullets concise (1-2 lines)
      if (normalizedBullet.length > 150) {
        violations.push({
          rule: `${entryType}[${entryIndex}].Bullets[${bulletIndex}].TooLong`,
          message: 'Bullet point is too long. Aim for 1-2 lines.',
          suggestion:
            'Consider splitting the bullet point or making it more concise.',
        });
      }

      // Rule: No personal pronouns
      const lowerCaseBullet = normalizedBullet.toLowerCase();
      if (
        lowerCaseBullet.startsWith('i ') ||
        lowerCaseBullet.startsWith('we ')
      ) {
        violations.push({
          rule: `${entryType}[${entryIndex}].Bullets[${bulletIndex}].HasPronoun`,
          message:
            'Bullet points should not start with personal pronouns like "I" or "We".',
          suggestion: 'Start with a strong action verb instead.',
        });
      }

      // Rule: Start with a strong action verb
      const firstWord = lowerCaseBullet.split(' ')[0];
      if (!STRONG_ACTION_VERBS.includes(firstWord)) {
        violations.push({
          rule: `${entryType}[${entryIndex}].Bullets[${bulletIndex}].WeakActionVerb`,
          message: `Bullet point does not appear to start with a strong action verb.`,
          suggestion: `Start with a strong verb like "Developed", "Managed", or "Implemented". The first word found was "${firstWord}".`,
        });
      }

      // Rule: Quantify achievements
      const hasQuantification =
        /\d/.test(normalizedBullet) ||
        /%/.test(normalizedBullet) ||
        /\$/.test(normalizedBullet);
      if (!hasQuantification) {
        violations.push({
          rule: `${entryType}[${entryIndex}].Bullets[${bulletIndex}].NotQuantified`,
          message:
            'Bullet point is not quantified. Adding metrics demonstrates impact.',
          suggestion:
            'Add numbers, percentages, or dollar amounts to show the impact of your work (e.g., "Increased performance by 20%").',
        });
      }

      // Rule: Check for impact-oriented frameworks like XYZ
      const hasXYZPattern = /measured by.*by doing/i.test(normalizedBullet);
      if (!hasQuantification && !hasXYZPattern) {
        violations.push({
          rule: `${entryType}[${entryIndex}].Bullets[${bulletIndex}].NotImpactOriented`,
          message: 'Bullet point may not be impact-oriented.',
          suggestion:
            'Structure your bullet points using frameworks like STAR or XYZ (e.g., "Accomplished X, as measured by Y, by doing Z") to better demonstrate your impact.',
        });
      }

      // Update the bullet in the array with the normalized version
      bullets[bulletIndex] = normalizedBullet;
    });

    return violations;
  }

  public enforceExperience(entries: ExperienceEntryDto[]): {
    normalizedEntries: ExperienceEntryDto[];
    violations: RuleViolation[];
  } {
    const allViolations: RuleViolation[] = [];
    const normalizedEntries = JSON.parse(JSON.stringify(entries)); // Deep copy

    normalizedEntries.forEach((entry: ExperienceEntryDto, index: number) => {
      const bulletViolations = this.enforceBullets(
        entry.bullets,
        index,
        'Experience',
      );
      allViolations.push(...bulletViolations);
    });

    return { normalizedEntries, violations: allViolations };
  }

  public enforceProjects(entries: ProjectEntryDto[]): {
    normalizedEntries: ProjectEntryDto[];
    violations: RuleViolation[];
  } {
    const allViolations: RuleViolation[] = [];
    const normalizedEntries = JSON.parse(JSON.stringify(entries)); // Deep copy

    normalizedEntries.forEach((entry: ProjectEntryDto, index: number) => {
      // Project-specific rule: Title capitalization
      if (entry.name && entry.name[0] !== entry.name[0].toUpperCase()) {
        allViolations.push({
          rule: `Project[${index}].Name.NotCapitalized`,
          message: `Project title "${entry.name}" should be capitalized.`,
          suggestion: 'Capitalize the first letter of the project title.',
        });
      }

      const bulletViolations = this.enforceBullets(
        entry.bullets,
        index,
        'Project',
      );
      allViolations.push(...bulletViolations);
    });

    return { normalizedEntries, violations: allViolations };
  }
}
