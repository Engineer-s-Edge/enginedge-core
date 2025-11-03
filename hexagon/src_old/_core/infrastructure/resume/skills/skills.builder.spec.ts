import { Test, TestingModule } from '@nestjs/testing';
import { SkillsBuilder } from './skills.builder';
import { SkillsRuleEnforcer } from './skills.rule-enforcer';

describe('SkillsBuilder', () => {
  let builder: SkillsBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SkillsBuilder, SkillsRuleEnforcer],
    }).compile();

    builder = module.get<SkillsBuilder>(SkillsBuilder);
  });

  it('should be defined', () => {
    expect(builder).toBeDefined();
  });

  it('should extract and categorize skills from a text corpus', () => {
    const corpus =
      'I developed a web application using React and Node.js. For the database, I used MongoDB.';
    const skillsSection = builder.build(corpus);

    expect(skillsSection.categories.has('Frameworks/Libraries')).toBe(true);
    expect(skillsSection.categories.get('Frameworks/Libraries')).toContain(
      'React',
    );
    expect(skillsSection.categories.get('Frameworks/Libraries')).toContain(
      'Node.js',
    );

    expect(skillsSection.categories.has('Databases')).toBe(true);
    expect(skillsSection.categories.get('Databases')).toContain('MongoDB');
  });

  it('should return an empty skills section if no known skills are found', () => {
    const corpus = 'I went for a walk in the park.';
    const skillsSection = builder.build(corpus);
    expect(skillsSection.categories.size).toBe(0);
  });

  it('should use the enforcer to normalize the output', () => {
    // The enforcer sorts skills alphabetically.
    const corpus = 'I used Node.js and React.';
    const skillsSection = builder.build(corpus);
    expect(skillsSection.categories.get('Frameworks/Libraries')).toEqual([
      'Node.js',
      'React',
    ]);
  });
});
