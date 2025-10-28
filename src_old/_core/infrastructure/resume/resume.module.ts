import { Module } from '@nestjs/common';
import { LLMModule } from '../agents/components/llm/llm.module';
import { HeaderRuleEnforcer } from './header/header.rule-enforcer';
import { EducationRuleEnforcer } from './education/education.rule-enforcer';
import { SkillsRuleEnforcer } from './skills/skills.rule-enforcer';
import { ExperienceProjectsRuleEnforcer } from './experience/experience-projects.rule-enforcer';
import { SkillsBuilder } from './skills/skills.builder';
import { ExperienceProjectsBuilder } from './experience/experience-projects.builder';

@Module({
  imports: [LLMModule.register()],
  providers: [
    HeaderRuleEnforcer,
    EducationRuleEnforcer,
    SkillsRuleEnforcer,
    ExperienceProjectsRuleEnforcer,
    SkillsBuilder,
    ExperienceProjectsBuilder,
  ],
  exports: [
    HeaderRuleEnforcer,
    EducationRuleEnforcer,
    SkillsRuleEnforcer,
    ExperienceProjectsRuleEnforcer,
    SkillsBuilder,
    ExperienceProjectsBuilder,
  ],
})
export class ResumeModule {}
