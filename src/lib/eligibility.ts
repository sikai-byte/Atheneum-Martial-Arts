type EligibilityProfile = {
  isChild: boolean;
  adultClassEligible: boolean;
  membershipType: string | null;
  user?: { role: string } | null;
};

const NON_MEMBER_ROLES = ["PARENT", "ADMIN"];

/** Parent and admin profiles can only join classes if they hold their own membership. Coaches are always eligible. */
export function isNonMemberParentOrStaff(profile: EligibilityProfile): boolean {
  const role = profile.user?.role;
  return role !== undefined && role !== null && NON_MEMBER_ROLES.includes(role) && !profile.membershipType;
}

export function matchesAgeGroup(
  profile: { isChild: boolean; adultClassEligible: boolean },
  ageGroup: string
): boolean {
  if (ageGroup === "KIDS") return profile.isChild;
  if (ageGroup === "ADULTS") return !profile.isChild || profile.adultClassEligible;
  return true;
}

export function classEligibilityError(
  profile: EligibilityProfile,
  template: { ageGroup: string; name: string }
): string | null {
  if (!matchesAgeGroup(profile, template.ageGroup)) {
    return template.ageGroup === "KIDS"
      ? "Kids classes are for youth members only."
      : "Adult classes are for adult members only.";
  }
  if (isNonMemberParentOrStaff(profile)) {
    return profile.user?.role === "PARENT"
      ? "Parents need their own membership to join classes."
      : "Staff need their own membership to join classes.";
  }
  return null;
}
