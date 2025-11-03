export interface RuleViolation {
  rule: string;
  message: string;
  suggestion: string;
}

export interface HeaderDto {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  links: string[];
  extras?: string[];
}

export interface EducationEntryDto {
  institution: string;
  degree: string;
  field?: string;
  gradMonth?: number;
  gradYear: number;
  gpaValue?: number;
  gpaType?: 'scale' | 'percentage';
  honors?: string;
  awards?: string;
  coursework?: string[];
}

export interface SkillsSectionDto {
  categories: Map<string, string[]>;
}

export interface ExperienceEntryDto {
  title: string;
  company: string;
  location?: string;
  start?: string;
  end?: string;
  bullets: string[];
}

export interface ProjectEntryDto {
  name: string;
  link?: string;
  tech: string[];
  bullets: string[];
}

export interface FullResumeDto {
  header: HeaderDto;
  education: EducationEntryDto[];
  skills: SkillsSectionDto;
  experience: ExperienceEntryDto[];
  projects: ProjectEntryDto[];
}

export interface ParsedJobDescription {
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
}
