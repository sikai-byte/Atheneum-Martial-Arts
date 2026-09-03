import { describe, expect, it } from "vitest";
import { describesOtherSlot, verifyAgainstFacts } from "@/lib/leads/agent";
import { isQuietHour, nextSendableTime } from "@/lib/leads/config";
import { ageGroupFromRow, parseLeadCsv } from "@/lib/leads/csv";
import { normalizePhone } from "@/lib/leads/phone";
import { truncateForSms } from "@/lib/leads/templates";

const FACTS = [
  "Adult unlimited membership is $175/month.",
  "No Gi BJJ (Adults): Monday 6:15 PM",
  "Little Kids: Saturday 9:00 AM",
].join("\n");

describe("verifyAgainstFacts", () => {
  it("passes a message whose price and slot are both in the corpus", () => {
    expect(
      verifyAgainstFacts("Adult unlimited is $175/month — Monday 6:15 PM works?", FACTS),
    ).toEqual({ ok: true });
  });

  it("rejects an invented price", () => {
    const verdict = verifyAgainstFacts("I can do $120/month for you.", FACTS);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.violation).toContain("$120");
  });

  it("rejects a class time that is not a real slot", () => {
    const verdict = verifyAgainstFacts("Come by Monday at 7:45 PM.", FACTS);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.violation).toContain("7:45 PM");
  });

  it("rejects a weekday the schedule never mentioned", () => {
    const verdict = verifyAgainstFacts("Thursday is a good one to start.", FACTS);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.violation).toContain("Thursday");
  });

  it("ignores spacing differences between the message and the corpus", () => {
    expect(verifyAgainstFacts("See you Monday 6:15PM.", FACTS)).toEqual({ ok: true });
  });
});

describe("describesOtherSlot", () => {
  // 2026-09-07T23:15Z is Monday 6:15 PM in America/Chicago.
  const monday615 = new Date("2026-09-07T23:15:00Z");
  const tz = "America/Chicago";

  it("accepts text that names the slot it books", () => {
    expect(describesOtherSlot("Monday at 6:15 PM works?", monday615, tz)).toBeNull();
  });

  it("accepts text that names no day or time", () => {
    expect(describesOtherSlot("Booked you in — see you soon!", monday615, tz)).toBeNull();
  });

  it("catches a weekday that contradicts the booking", () => {
    expect(describesOtherSlot("See you Friday at 6:15 PM", monday615, tz)).toBe("Friday");
  });

  it("catches a time that contradicts the booking", () => {
    expect(describesOtherSlot("See you Monday at 7:15 PM", monday615, tz)).toBe("7:15 PM");
  });

  it("judges the slot in studio time, not the server's", () => {
    // Thursday 7:15 PM in Chicago is already Friday 00:15 in UTC — the bug this guards against.
    const thursday715 = new Date("2026-09-11T00:15:00Z");
    expect(describesOtherSlot("Thursday it is", thursday715, tz)).toBeNull();
    expect(describesOtherSlot("Thursday it is", thursday715, "UTC")).toBe("Thursday");
  });
});

describe("quiet hours", () => {
  const config = { timezone: "America/Chicago", quietHoursStart: 21, quietHoursEnd: 8 };

  it("treats the window as wrapping past midnight", () => {
    expect(isQuietHour(new Date("2026-09-08T03:00:00Z"), config)).toBe(true); // 22:00 local
    expect(isQuietHour(new Date("2026-09-08T12:00:00Z"), config)).toBe(true); // 07:00 local
    expect(isQuietHour(new Date("2026-09-08T18:00:00Z"), config)).toBe(false); // 13:00 local
  });

  it("has no quiet hours when start equals end", () => {
    expect(isQuietHour(new Date(), { ...config, quietHoursStart: 8, quietHoursEnd: 8 })).toBe(false);
  });

  it("moves a held send forward to the first sendable hour", () => {
    const held = new Date("2026-09-08T03:30:00Z");
    const sendable = nextSendableTime(held, config);
    expect(isQuietHour(sendable, config)).toBe(false);
    expect(sendable.getTime()).toBeGreaterThan(held.getTime());
  });
});

describe("normalizePhone", () => {
  it("reads the shapes a coach or a spreadsheet actually types", () => {
    expect(normalizePhone("612-558-3765")).toBe("+16125583765");
    expect(normalizePhone("(612) 558 3765")).toBe("+16125583765");
    expect(normalizePhone("16125583765")).toBe("+16125583765");
    expect(normalizePhone("+16125583765")).toBe("+16125583765");
  });

  it("returns null rather than guessing at something undialable", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("555-1234")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("truncateForSms", () => {
  it("leaves a normal text alone and caps a runaway one", () => {
    expect(truncateForSms("short")).toBe("short");
    const long = "a".repeat(400);
    expect(truncateForSms(long).length).toBe(320);
    expect(truncateForSms(long).endsWith("…")).toBe(true);
  });
});

describe("parseLeadCsv", () => {
  it("maps aliased headers and keeps unknown columns as extras", () => {
    const { rows, extras } = parseLeadCsv(
      ["full name,phone number,email,program,goal", "Ana Diaz,612-558-3765,ana@x.com,BJJ,confidence"].join("\n"),
    );
    expect(rows).toEqual([
      { name: "Ana Diaz", phone: "612-558-3765", email: "ana@x.com", interest: "BJJ", goal: "confidence" },
    ]);
    expect(extras).toEqual(["goal"]);
  });

  it("treats a headerless paste as name,phone,email,interest", () => {
    const { rows } = parseLeadCsv("Ana Diaz,612-558-3765,ana@x.com,BJJ");
    expect(rows[0]).toMatchObject({ name: "Ana Diaz", phone: "612-558-3765" });
  });

  it("infers a kid from a child name, an age or the wording", () => {
    expect(ageGroupFromRow({ childName: "Leo" })).toEqual({ ageGroup: "KID", childName: "Leo" });
    expect(ageGroupFromRow({ age: "8" }).ageGroup).toBe("KID");
    expect(ageGroupFromRow({ interest: "classes for my son" }).ageGroup).toBe("KID");
    expect(ageGroupFromRow({ interest: "Muay Thai for myself" }).ageGroup).toBe("ADULT");
    expect(ageGroupFromRow({ interest: "Muay Thai" }).ageGroup).toBe("UNKNOWN");
  });
});
