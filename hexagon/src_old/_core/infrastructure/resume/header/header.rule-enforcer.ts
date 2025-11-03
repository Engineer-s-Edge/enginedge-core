import { Injectable } from '@nestjs/common';
import { HeaderDto, RuleViolation } from '../dtos/resume.dtos';

@Injectable()
export class HeaderRuleEnforcer {
  enforce(header: HeaderDto): {
    normalizedHeader: HeaderDto;
    violations: RuleViolation[];
  } {
    const violations: RuleViolation[] = [];
    const normalizedHeader = JSON.parse(JSON.stringify(header)); // Deep copy

    // Full Name
    if (!normalizedHeader.fullName || !normalizedHeader.fullName.trim()) {
      violations.push({
        rule: 'Header.FullName.Required',
        message: 'Full name is required.',
        suggestion: 'Please provide a full name.',
      });
    } else {
      normalizedHeader.fullName = normalizedHeader.fullName.trim();
      if (
        normalizedHeader.fullName === normalizedHeader.fullName.toUpperCase() &&
        normalizedHeader.fullName !== normalizedHeader.fullName.toLowerCase()
      ) {
        violations.push({
          rule: 'Header.FullName.AllCaps',
          message:
            'Full name should not be in all capital letters unless it is a consistent style choice.',
          suggestion:
            'Consider using title case for your name (e.g., "John Doe").',
        });
      }
    }

    // Email
    if (!normalizedHeader.email || !normalizedHeader.email.trim()) {
      violations.push({
        rule: 'Header.Email.Required',
        message: 'Email is required.',
        suggestion: 'Please provide an email address.',
      });
    } else {
      normalizedHeader.email = normalizedHeader.email.trim();
      if (normalizedHeader.email.toLowerCase().startsWith('email:')) {
        normalizedHeader.email = normalizedHeader.email.substring(6).trim();
        violations.push({
          rule: 'Header.Email.Label',
          message: 'Email should not have a label like "Email:".',
          suggestion: 'Remove the "Email:" label.',
        });
      }
    }

    // Phone
    if (normalizedHeader.phone) {
      let cleanedPhone = normalizedHeader.phone.trim();

      if (cleanedPhone.toLowerCase().startsWith('phone:')) {
        cleanedPhone = cleanedPhone.substring(6).trim();
        violations.push({
          rule: 'Header.Phone.Label',
          message: 'Phone number should not have a label like "Phone:".',
          suggestion: 'Remove the "Phone:" label.',
        });
      }

      const justDigits = cleanedPhone.replace(/\D/g, '');

      if (justDigits.length === 10) {
        normalizedHeader.phone = `(${justDigits.substring(0, 3)}) ${justDigits.substring(3, 6)}-${justDigits.substring(6, 10)}`;
      } else if (justDigits.length === 11 && justDigits.startsWith('1')) {
        const withoutCountryCode = justDigits.substring(1);
        normalizedHeader.phone = `(${withoutCountryCode.substring(0, 3)}) ${withoutCountryCode.substring(3, 6)}-${withoutCountryCode.substring(6, 10)}`;
      } else {
        normalizedHeader.phone = cleanedPhone; // Keep the cleaned version on failure
        violations.push({
          rule: 'Header.Phone.Format',
          message: 'Phone number is not in a standard 10-digit format.',
          suggestion: 'Please provide a valid 10-digit phone number.',
        });
      }
    }

    // Location
    if (normalizedHeader.location) {
      normalizedHeader.location = normalizedHeader.location.trim();
      const locationRegex = /.+,\s*\w{2}/;
      if (!locationRegex.test(normalizedHeader.location)) {
        violations.push({
          rule: 'Header.Location.Format',
          message: 'Location should be in "City, ST" format.',
          suggestion: 'For example, "San Francisco, CA".',
        });
      }
    }

    // Links
    if (normalizedHeader.links) {
      // Deduplicate
      normalizedHeader.links = [...new Set(normalizedHeader.links)];

      // Normalize and sort
      normalizedHeader.links = normalizedHeader.links.map((link: string) => {
        return link.replace(/^(https?:\/\/)?(www\.)?/, '');
      });

      const linkOrder = ['github.com', 'portfolio', 'linkedin.com']; // Simplified order
      normalizedHeader.links.sort((a: string, b: string) => {
        const aIndex = linkOrder.findIndex((domain) => a.includes(domain));
        const bIndex = linkOrder.findIndex((domain) => b.includes(domain));
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    }

    return { normalizedHeader, violations };
  }
}
