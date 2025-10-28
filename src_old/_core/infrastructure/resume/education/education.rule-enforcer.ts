import { Injectable } from '@nestjs/common';
import { EducationEntryDto, RuleViolation } from '../dtos/resume.dtos';

@Injectable()
export class EducationRuleEnforcer {
  enforce(
    entries: EducationEntryDto[],
    isExperienced: boolean = false,
  ): { normalizedEntries: EducationEntryDto[]; violations: RuleViolation[] } {
    const violations: RuleViolation[] = [];
    let normalizedEntries = JSON.parse(JSON.stringify(entries)); // Deep copy

    normalizedEntries.forEach((entry: EducationEntryDto, index: number) => {
      // GPA check
      if (entry.gpaValue) {
        const gpaType = entry.gpaType || 'scale'; // Default to scale

        if (gpaType === 'scale') {
          if (entry.gpaValue < 3.75) {
            violations.push({
              rule: `Education[${index}].Gpa.TooLow`,
              message: `GPA (${entry.gpaValue}) is below the recommended 3.75 threshold for inclusion.`,
              suggestion:
                'Consider removing the GPA to save space for more impactful information.',
            });
          }
          entry.gpaValue = parseFloat(entry.gpaValue.toFixed(2));
        } else if (gpaType === 'percentage') {
          if (entry.gpaValue < 80) {
            violations.push({
              rule: `Education[${index}].Gpa.TooLow`,
              message: `Percentage average (${entry.gpaValue}%) is below the recommended 80% threshold.`,
              suggestion: 'Consider removing this percentage average.',
            });
          }
        }

        if (isExperienced) {
          violations.push({
            rule: `Education[${index}].Gpa.ExperiencedProfessional`,
            message:
              'GPA is generally not included for professionals with work experience.',
            suggestion: 'Consider removing the GPA to save space.',
          });
        }
      }

      // Coursework check
      if (entry.coursework && entry.coursework.length > 5) {
        violations.push({
          rule: `Education[${index}].Coursework.TooLong`,
          message: 'The list of coursework is too long.',
          suggestion:
            'Consider listing only the most relevant and specialized courses (max 5).',
        });
      }

      // Degree and Institution check
      if (!entry.institution || !entry.institution.trim()) {
        violations.push({
          rule: `Education[${index}].Institution.Required`,
          message: `Institution name is required for entry #${index + 1}.`,
          suggestion: 'Please provide the name of the institution.',
        });
      } else {
        entry.institution = entry.institution.trim();
      }

      if (!entry.degree || !entry.degree.trim()) {
        violations.push({
          rule: `Education[${index}].Degree.Required`,
          message: `Degree is required for entry #${index + 1}.`,
          suggestion: 'Please provide the degree obtained (e.g., "B.S.").',
        });
      } else {
        entry.degree = entry.degree.trim();
      }

      if (entry.field) {
        entry.field = entry.field.trim();
      }
    });

    // Sort entries reverse-chronologically
    normalizedEntries.sort((a: EducationEntryDto, b: EducationEntryDto) => {
      if (a.gradYear !== b.gradYear) {
        return b.gradYear - a.gradYear;
      }
      // gradMonth is optional, so handle cases where it might be missing
      const monthA = a.gradMonth || 0;
      const monthB = b.gradMonth || 0;
      return monthB - monthA;
    });

    return { normalizedEntries, violations };
  }
}
