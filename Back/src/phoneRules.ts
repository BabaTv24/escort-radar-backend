import { normalizePhone } from './utils/identity.js';

// 'conflict' is a manual, admin-only judgment (see the phone-conflict-status admin route) --
// automatic evaluation below never assigns it, since a shared number alone is not reliable
// evidence of two different owners.
export type PhoneConflictStatus = 'clear' | 'warning' | 'conflict';

export type ConflictingProfileMatch = {
  phone_owner_identity_label?: string | null;
};

export type PhoneRuleCheckInput = {
  accountType: unknown;
  primaryPhone: unknown;
  additionalPhones: unknown;
  ownerLabel: unknown;
  phoneRuleConfirmed: unknown;
  conflictingProfiles: ConflictingProfileMatch[];
};

export type PhoneRuleData = {
  primary_phone: string | null;
  additional_phones: string[];
  phone_owner_identity_label: string | null;
  phone_conflict_status: PhoneConflictStatus;
};

export type PhoneRuleDecision = { error: string; code: string } | { data: PhoneRuleData };

// Phone numbers are a contact/work channel, not a verified identity: sponsored profiles are
// imported by Admin with pre-existing numbers, get claimed later by a different person, and
// numbers change routinely in this industry. So the same number appearing on another profile
// is recorded only as an internal diagnostic signal for Admin (phone_conflict_status:
// 'warning') -- it never blocks the save, and phone_owner_identity_label/display_name are
// unverified free-text labels that must never gate a save decision.
// The one remaining save-time gate is a same-profile UX nudge: a private profile listing more
// than one distinct phone number must confirm (once) that they are all the advertiser's own
// channels. A single phone number never needs this confirmation.
export function evaluatePhoneRules(input: PhoneRuleCheckInput): PhoneRuleDecision {
  const primaryPhone = normalizePhone(input.primaryPhone);
  const additionalPhones = Array.isArray(input.additionalPhones)
    ? input.additionalPhones.map(normalizePhone).filter(Boolean)
    : [];
  const ownerLabel = String(input.ownerLabel || '').trim().slice(0, 120);
  const accountType = String(input.accountType || 'private');

  const phoneConflictStatus: PhoneConflictStatus = primaryPhone && input.conflictingProfiles.length ? 'warning' : 'clear';

  const distinctPhoneNumbers = new Set([primaryPhone, ...additionalPhones].filter(Boolean));
  if (accountType === 'private' && distinctPhoneNumbers.size > 1 && !input.phoneRuleConfirmed) {
    return {
      error: 'Private accounts must confirm that all phone numbers belong to the same individual advertiser.',
      code: 'phone_owner_confirmation_required'
    };
  }

  return {
    data: {
      primary_phone: primaryPhone || null,
      additional_phones: additionalPhones,
      phone_owner_identity_label: ownerLabel || null,
      phone_conflict_status: phoneConflictStatus
    }
  };
}
