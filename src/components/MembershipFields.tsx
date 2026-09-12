"use client";

import { useState } from "react";

export default function MembershipFields({
  membershipPlan,
  membershipType,
  renewsAtValue,
  trialClassType,
  punchPassTotal,
  punchPassUsed,
}: {
  membershipPlan: string;
  membershipType: string;
  renewsAtValue: string;
  trialClassType: string;
  punchPassTotal: number | null;
  punchPassUsed: number;
}) {
  const [type, setType] = useState(membershipType);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="membership-type" className="mb-1 block text-sm font-medium">
          Type
        </label>
        <select
          id="membership-type"
          name="membershipType"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        >
          <option value="">None</option>
          <option value="MONTHLY">Monthly (renews on a date)</option>
          <option value="PUNCH_PASS">Punch pass (class count)</option>
          <option value="TRIAL">Trial (ends on a date)</option>
        </select>
      </div>
      {type !== "" && (
        <div>
          <label htmlFor="membership-plan" className="mb-1 block text-sm font-medium">
            Plan name
          </label>
          <input
            id="membership-plan"
            name="membershipPlan"
            maxLength={80}
            defaultValue={membershipPlan}
            placeholder={
              type === "PUNCH_PASS"
                ? "e.g. 10-Class Punch Pass"
                : type === "TRIAL"
                  ? "e.g. Trial Week"
                  : "e.g. Adult Unlimited"
            }
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          />
        </div>
      )}
      {(type === "MONTHLY" || type === "TRIAL") && (
        <div>
          <label htmlFor="membership-renews" className="mb-1 block text-sm font-medium">
            {type === "TRIAL" ? "Trial ends on" : "Renews on"}
          </label>
          <input
            id="membership-renews"
            name="membershipRenewsAt"
            type="date"
            defaultValue={renewsAtValue}
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          />
        </div>
      )}
      {type === "TRIAL" && (
        <div>
          <label htmlFor="trial-class-type" className="mb-1 block text-sm font-medium">
            Trial classes allowed
          </label>
          <select
            id="trial-class-type"
            name="trialClassType"
            defaultValue={trialClassType}
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          >
            <option value="BOTH">Group classes and private trials</option>
            <option value="GROUP">Group classes only</option>
            <option value="PRIVATE">Private trial only</option>
          </select>
        </div>
      )}
      {type === "PUNCH_PASS" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="punch-total" className="mb-1 block text-sm font-medium">
              Pass size
            </label>
            <input
              id="punch-total"
              name="punchPassTotal"
              type="number"
              min={1}
              max={100}
              defaultValue={punchPassTotal ?? 10}
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="punch-used" className="mb-1 block text-sm font-medium">
              Classes used
            </label>
            <input
              id="punch-used"
              name="punchPassUsed"
              type="number"
              min={0}
              max={100}
              defaultValue={punchPassUsed}
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
