import { SkillsRuleEnforcer } from '..';
import { SkillsSectionDto } from '../dtos/resume.dtos';

describe('SkillsRuleEnforcer', () => {
  let enforcer: SkillsRuleEnforcer;

  beforeEach(() => {
    enforcer = new SkillsRuleEnforcer();
  });

  const createSkillsSection = (
    categories: [string, string[]][],
  ): SkillsSectionDto => ({
    categories: new Map(categories),
  });

  it('should return no violations for a valid skills section', () => {
    const skills = createSkillsSection([
      ['Languages', ['JavaScript', 'Python']],
      ['Tools', ['Git', 'Docker']],
    ]);
    const corpus =
      'Developed a web app with JavaScript and Python. Used Git and Docker for deployment.';
    const { violations } = enforcer.enforce(skills, corpus);
    expect(violations).toHaveLength(0);
  });

  it('should flag trivial and soft skills', () => {
    const skills = createSkillsSection([['Languages', ['Typing', 'Teamwork']]]);
    const { violations } = enforcer.enforce(skills, 'some corpus');
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Skills.Trivial' }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Skills.SoftSkill' }),
    );
  });

  it('should canonicalize skill synonyms and normalize casing', () => {
    const skills = createSkillsSection([
      ['Languages', ['js', 'typescript']],
      ['Frameworks/Libraries', ['node']],
    ]);
    const corpus = 'js node typescript';
    const { normalizedSkills } = enforcer.enforce(skills, corpus);
    const languages = normalizedSkills.categories.get('Languages');
    const frameworks = normalizedSkills.categories.get('Frameworks/Libraries');
    expect(languages).toContain('JavaScript');
    expect(languages).toContain('TypeScript');
    expect(frameworks).toContain('Node.js');
  });

  it('should flag skills not present in the resume corpus', () => {
    const skills = createSkillsSection([['Languages', ['Java']]]);
    const corpus = 'I wrote some Python code.';
    const { violations } = enforcer.enforce(skills, corpus);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Skills.NotInCorpus' }),
    );
  });

  it('should flag if there are too many skills', () => {
    const skillList = Array.from({ length: 31 }, (_, i) => `Skill${i}`);
    const skills = createSkillsSection([['Tools', skillList]]);
    const corpus = skillList.join(' ');
    const { violations } = enforcer.enforce(skills, corpus);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Skills.TooMany' }),
    );
  });

  it('should flag non-recommended categories', () => {
    const skills = createSkillsSection([['Hobbies', ['Skiing']]]);
    const corpus = 'I like Skiing.';
    const { violations } = enforcer.enforce(skills, corpus);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Skills.Category.NotRecommended' }),
    );
  });

  it('should deduplicate skills across categories', () => {
    const skills = createSkillsSection([
      ['Languages', ['JavaScript']],
      ['Tools', ['javascript']],
    ]);
    const corpus = 'I used JavaScript.';
    const { normalizedSkills } = enforcer.enforce(skills, corpus);
    // The enforcer logic keeps the first one it sees. Let's adjust the test to be more robust.
    // My current enforcer adds the skill to a Set to track duplicates, so only the first one encountered will be kept.
    // The order of iteration over a Map's entries is insertion order. So 'Languages' will be processed first.
    expect(normalizedSkills.categories.get('Languages')).toContain(
      'JavaScript',
    );
    expect(normalizedSkills.categories.has('Tools')).toBe(false); // The 'Tools' category should be empty and thus removed.
  });

  it('should sort skills alphabetically within categories', () => {
    const skills = createSkillsSection([
      ['Languages', ['Python', 'C++', 'Assembly']],
    ]);
    const corpus = 'Python C++ Assembly';
    const { normalizedSkills } = enforcer.enforce(skills, corpus);
    expect(normalizedSkills.categories.get('Languages')).toEqual([
      'Assembly',
      'C++',
      'Python',
    ]);
  });
});
