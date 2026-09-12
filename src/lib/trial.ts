// Trial memberships use membershipType "TRIAL" with membershipRenewsAt as the
// trial end date; the trial covers classes through the end of that day.
export function trialEndOfDay(endsAt: Date | null): Date | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function trialExpired(endsAt: Date | null): boolean {
  const end = trialEndOfDay(endsAt);
  return !end || new Date() > end;
}
