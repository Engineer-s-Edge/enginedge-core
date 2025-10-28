import { Injectable } from '@nestjs/common';
import { SkillsRuleEnforcer } from './skills.rule-enforcer';
import { SkillsSectionDto } from '../dtos/resume.dtos';

const SKILL_TO_CATEGORY_MAP = new Map<string, string>([
  // Languages
  ['JavaScript', 'Languages'],
  ['TypeScript', 'Languages'],
  ['Python', 'Languages'],
  ['Java', 'Languages'],
  ['C++', 'Languages'],
  // Frameworks/Libraries
  ['React', 'Frameworks/Libraries'],
  ['Angular', 'Frameworks/Libraries'],
  ['Vue.js', 'Frameworks/Libraries'],
  ['Node.js', 'Frameworks/Libraries'],
  ['Express', 'Frameworks/Libraries'],
  // Databases
  ['MongoDB', 'Databases'],
  ['PostgreSQL', 'Databases'],
  ['MySQL', 'Databases'],
  // Tools
  ['Git', 'Tools'],
  ['Docker', 'Tools'],
  ['Kubernetes', 'Tools'],
  // Cloud/Platforms
  ['Amazon Web Services', 'Cloud/Platforms'],
  ['Google Cloud Platform', 'Cloud/Platforms'],
  ['Microsoft Azure', 'Cloud/Platforms'],
]);

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

@Injectable()
export class SkillsBuilder {
  constructor(private readonly skillsRuleEnforcer: SkillsRuleEnforcer) {}

  build(corpus: string): SkillsSectionDto {
    const foundSkills = new Map<string, string[]>(); // Category -> Skills[]

    const lowerCaseCorpus = corpus.toLowerCase();

    for (const [skill, category] of SKILL_TO_CATEGORY_MAP.entries()) {
      const skillRegex = new RegExp(
        `\\b${escapeRegExp(skill.toLowerCase())}\\b`,
      );
      if (skillRegex.test(lowerCaseCorpus)) {
        if (!foundSkills.has(category)) {
          foundSkills.set(category, []);
        }
        foundSkills.get(category)!.push(skill);
      }
    }

    const initialSkillsSection: SkillsSectionDto = {
      categories: foundSkills,
    };

    const { normalizedSkills } = this.skillsRuleEnforcer.enforce(
      initialSkillsSection,
      corpus,
    );

    return normalizedSkills;
  }
}
