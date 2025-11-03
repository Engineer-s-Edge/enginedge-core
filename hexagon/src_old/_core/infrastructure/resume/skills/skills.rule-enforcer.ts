import { Injectable } from '@nestjs/common';
import { SkillsSectionDto, RuleViolation } from '../dtos/resume.dtos';

const RECOMMENDED_CATEGORIES = [
  'Languages',
  'Frameworks/Libraries',
  'Tools',
  'Cloud/Platforms',
  'Databases',
  'Testing/CI',
];
const SOFT_SKILLS = [
  'communication',
  'teamwork',
  'leadership',
  'problem-solving',
  'work ethic',
  'adaptability',
];
const TRIVIAL_SKILLS = [
  'microsoft word',
  'ms word',
  'word',
  'microsoft excel',
  'ms excel',
  'excel',
  'typing',
  'powerpoint',
  'outlook',
];
const SKILL_SYNONYMS: { [key: string]: string } = {
  node: 'Node.js',
  nodejs: 'Node.js',
  reactjs: 'React',
  'react.js': 'React',
  angularjs: 'Angular',
  aws: 'Amazon Web Services',
  gcp: 'Google Cloud Platform',
  azure: 'Microsoft Azure',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  vue: 'Vue.js',
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
};

@Injectable()
export class SkillsRuleEnforcer {
  enforce(
    skillsSection: SkillsSectionDto,
    resumeCorpus: string,
  ): { normalizedSkills: SkillsSectionDto; violations: RuleViolation[] } {
    const violations: RuleViolation[] = [];
    const normalizedSkills: SkillsSectionDto = { categories: new Map() };
    const allSkills = new Set<string>();

    const lowerCaseCorpus = resumeCorpus.toLowerCase();

    // Normalize, check, and deduplicate skills
    for (const [category, skills] of skillsSection.categories.entries()) {
      const newSkills: string[] = [];
      for (let skill of skills) {
        let normalizedSkill = skill.toLowerCase().trim();

        // Canonicalize
        if (SKILL_SYNONYMS[normalizedSkill]) {
          normalizedSkill = SKILL_SYNONYMS[normalizedSkill];
        } else {
          // Title Case for non-synonym skills
          normalizedSkill = normalizedSkill
            .split(' ')
            .map((w: string) => w.charAt(0).toUpperCase() + w.substring(1))
            .join(' ');
        }

        // Check for trivial/soft skills and duplicates
        if (TRIVIAL_SKILLS.includes(skill.toLowerCase().trim())) {
          violations.push({
            rule: 'Skills.Trivial',
            message: `Skill '${skill}' is considered trivial and should be removed.`,
            suggestion: 'Remove trivial skills like Microsoft Word.',
          });
          continue;
        }
        if (SOFT_SKILLS.includes(skill.toLowerCase().trim())) {
          violations.push({
            rule: 'Skills.SoftSkill',
            message: `Soft skill '${skill}' should be demonstrated in experience bullets, not listed here.`,
            suggestion: `Remove '${skill}' and show it through your accomplishments.`,
          });
          continue;
        }
        if (allSkills.has(normalizedSkill)) {
          continue; // Skip duplicates
        }

        // Check if skill appears in corpus
        if (!lowerCaseCorpus.includes(skill.toLowerCase().trim())) {
          violations.push({
            rule: 'Skills.NotInCorpus',
            message: `The skill '${skill}' is listed but not mentioned in the Experience or Projects sections.`,
            suggestion: `Ensure every skill is supported by a bullet point or remove it.`,
          });
        }

        allSkills.add(normalizedSkill);
        newSkills.push(normalizedSkill);
      }

      if (newSkills.length > 0) {
        // Sort skills alphabetically within the category
        newSkills.sort();
        normalizedSkills.categories.set(category, newSkills);
      }
    }

    // Check total skill count as a proxy for the 3-line rule
    if (allSkills.size > 30) {
      violations.push({
        rule: 'Skills.TooMany',
        message: 'The skills section is too long. Aim for conciseness.',
        suggestion:
          'Prune the least relevant skills to keep the section under 3 lines when rendered (approx. 30 skills max).',
      });
    }

    // Check for non-recommended categories
    for (const category of normalizedSkills.categories.keys()) {
      if (!RECOMMENDED_CATEGORIES.includes(category)) {
        violations.push({
          rule: 'Skills.Category.NotRecommended',
          message: `The category '${category}' is not a standard resume category.`,
          suggestion: `Consider using one of the recommended categories: ${RECOMMENDED_CATEGORIES.join(', ')}.`,
        });
      }
    }

    return { normalizedSkills, violations };
  }
}
