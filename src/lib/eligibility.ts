type EligibilityProfile = {
  isChild: boolean;
  membershipType: string | null;
  user?: { role: string } | null;
};

/** Parent profiles can only join classes if they hold their own membership. */
export function isNonMemberParent(profile: EligibilityProfile): boolean {
  return profile.user?.role === "PARENT" && !profile.membershipType;
}

export function matchesAgeGroup(profile: { isChild: boolean }, ageGroup: string): boolean {
  if (ageGroup === "KIDS") return profile.isChild;
  if (ageGroup === "ADULTS") return !profile.isChild;
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
  if (isNonMemberParent(profile)) {
    return "Parents need their own membership to join classes.";
  }
  return null;
}
