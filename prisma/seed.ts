import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextDateAt(dayOfWeek: number, hour: number, minute: number, weekOffset = 0) {
  const now = new Date();
  const d = new Date(now);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  d.setDate(now.getDate() + diff + weekOffset * 7);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function resetIfOutdatedSchedule() {
  const judo = await prisma.program.findUnique({ where: { name: "Judo" } });
  const withMembership = await prisma.memberProfile.count({
    where: { NOT: { membershipPlan: null } },
  });
  if (judo && withMembership > 0) return false;
  console.log("Outdated sample data detected — resetting database.");
  await prisma.attendance.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.classTemplate.deleteMany();
  await prisma.program.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.memberProfile.deleteMany();
  await prisma.order.deleteMany();
  await prisma.user.deleteMany();
  await prisma.household.deleteMany();
  return true;
}

async function seedProducts() {
  const existing = await prisma.product.count();
  if (existing > 0) return;
  const products = [
    {
      name: "Atheneum Mouthguard",
      description: "Team-branded mouthguard with case. Required for sparring.",
      category: "MOUTHGUARD",
      priceCents: 1500,
      sizes: "Youth,Adult",
      sortOrder: 1,
    },
    {
      name: "Atheneum Rashguard",
      description: "Long-sleeve team rashguard for no gi training.",
      category: "RASHGUARD",
      priceCents: 4500,
      sizes: "Kids S,Kids M,Kids L,XS,S,M,L,XL,XXL",
      sortOrder: 2,
    },
    {
      name: "Atheneum T-Shirt",
      description: "Soft cotton tee with the Atheneum lion logo.",
      category: "TSHIRT",
      priceCents: 2500,
      sizes: "Kids S,Kids M,Kids L,XS,S,M,L,XL,XXL",
      sortOrder: 3,
    },
    {
      name: "Atheneum Training Shorts",
      description: "Lightweight grappling shorts — no pockets or zippers.",
      category: "SHORTS",
      priceCents: 3500,
      sizes: "Kids S,Kids M,Kids L,XS,S,M,L,XL,XXL",
      sortOrder: 4,
    },
    {
      name: "Atheneum Gi",
      description: "Team gi with embroidered branding. Belt sold separately.",
      category: "GI",
      priceCents: 12000,
      sizes: "K1,K2,K3,A0,A1,A2,A3,A4",
      sortOrder: 5,
    },
    {
      name: "Boxing Gloves (Team Edition)",
      description: "Team-branded gloves for Muay Thai and kickboxing.",
      category: "GLOVES",
      priceCents: 6000,
      sizes: "8oz,10oz,12oz,14oz,16oz",
      sortOrder: 6,
    },
    {
      name: "Shin Guards (Team Edition)",
      description: "Padded shin guards for Muay Thai sparring.",
      category: "SHINGUARDS",
      priceCents: 5000,
      sizes: "Kids,S,M,L,XL",
      sortOrder: 7,
    },
    {
      name: "Atheneum Gym Bag",
      description: "Duffel bag with gear compartments and team logo.",
      category: "OTHER",
      priceCents: 4000,
      sizes: "",
      sortOrder: 8,
    },
  ];
  for (const p of products) {
    await prisma.product.create({ data: p });
  }
  console.log("Seeded shop products.");
}

const NEW_LEAD_STEPS = [
  {
    order: 1,
    delayMinutes: 0,
    goal: "Reply within 5 minutes while they're still on their phone",
    template:
      "Hi {{firstName}}, this is {{studio}} in Medina — thanks for asking about {{program}}! I can get {{who}} into a free class this week. Does a weeknight or Saturday work better?",
  },
  {
    order: 2,
    delayMinutes: 60,
    goal: "Nudge with a concrete option",
    template:
      "Hi {{firstName}}, still happy to hold a spot in {{program}} for {{who}}. Most people start with our beginner class — no experience or gear needed. Want me to book you in?",
  },
  {
    order: 3,
    delayMinutes: 1440,
    goal: "Answer the unasked question (cost/commitment)",
    template:
      "{{firstName}}, one thing folks always ask: the first class is free and there's no contract to try it. Here's the schedule if you'd rather pick a time yourself: {{bookingLink}} {{signature}}",
  },
  {
    order: 4,
    delayMinutes: 4320,
    goal: "Social proof",
    template:
      "Hi {{firstName}} — we just had a group of total beginners start {{program}} and they're loving it. Want me to save {{who}} a spot in the next beginner intake?",
  },
  {
    order: 5,
    delayMinutes: 10080,
    goal: "Polite close-out that keeps the door open",
    template:
      "No worries if the timing isn't right, {{firstName}}. I'll stop texting — reply anytime and I'll get {{who}} started. {{signature}}",
  },
];

const REACTIVATION_STEPS = [
  {
    order: 1,
    delayMinutes: 0,
    goal: "Re-introduce the studio without pretending they just enquired",
    template:
      "Hi {{firstName}}, it's {{studio}} in Medina. You reached out to us a while back, and we just opened new beginner spots in {{program}}. Want me to hold one for {{who}} this week?",
  },
  {
    order: 2,
    delayMinutes: 2880,
    goal: "Give a reason to act now",
    template:
      "{{firstName}}, the next beginner intake for {{program}} starts soon and it's the easiest time to jump in — everyone starts together. First class is free. Interested?",
  },
  {
    order: 3,
    delayMinutes: 10080,
    goal: "Low-pressure yes/no",
    template:
      "Hi {{firstName}} — simple question: is martial arts for {{who}} still something you'd like to try this year? Just reply Y or N and I'll take it from there.",
  },
  {
    order: 4,
    delayMinutes: 20160,
    goal: "Close out and leave the door open",
    template:
      "Understood, {{firstName}} — I'll leave it there. The door's always open at {{studio}} if things change. {{signature}}",
  },
];

async function seedFollowUpBot() {
  await prisma.botConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });

  const sequences = [
    {
      key: "NEW_LEAD",
      name: "New lead (5 texts over a week)",
      purpose: "Fresh Facebook or walk-in enquiry: first text immediately, then taper off.",
      steps: NEW_LEAD_STEPS,
    },
    {
      key: "REACTIVATION",
      name: "Old lead reactivation (4 texts over 3 weeks)",
      purpose: "Leads older than two weeks: re-introduce the studio and offer a new intake.",
      steps: REACTIVATION_STEPS,
    },
  ];

  for (const sequence of sequences) {
    const record = await prisma.sequence.upsert({
      where: { key: sequence.key },
      update: { name: sequence.name, purpose: sequence.purpose },
      create: { key: sequence.key, name: sequence.name, purpose: sequence.purpose },
    });
    for (const step of sequence.steps) {
      await prisma.sequenceStep.upsert({
        where: { sequenceId_order: { sequenceId: record.id, order: step.order } },
        update: { delayMinutes: step.delayMinutes, goal: step.goal, template: step.template },
        create: { ...step, sequenceId: record.id },
      });
    }
    await prisma.sequenceStep.deleteMany({
      where: { sequenceId: record.id, order: { gt: sequence.steps.length } },
    });
  }

  if ((await prisma.lead.count()) > 0) return;

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  // Sample leads showing the three states staff care about: waiting on the bot, replied and
  // needing a human, and an old lead being reactivated.
  const dana = await prisma.lead.create({
    data: {
      fullName: "Dana Whitaker (Sample)",
      phone: "+16125550134",
      email: "dana@example.com",
      source: "FACEBOOK_ADS",
      sourceRef: "sample-leadgen-1",
      campaign: "Kids BJJ — Medina",
      formName: "Free trial class",
      interest: "Kids BJJ for my 8 year old, weeknights",
      ageGroup: "KID",
      childName: "Ellie",
      answers: JSON.stringify({
        which_program: "Kids Brazilian Jiu-Jitsu",
        when_would_you_start: "As soon as possible",
      }),
      status: "CONTACTED",
      submittedAt: minutesAgo(46),
      firstContactedAt: minutesAgo(44),
      lastOutboundAt: minutesAgo(44),
      sequenceKey: "NEW_LEAD",
      sequenceStep: 1,
      insight: {
        create: {
          score: 82,
          temperature: "HOT",
          summary:
            "HOT lead (82/100): submitted under an hour ago, wants to start as soon as possible, parent enquiring for a child.",
          intent: "Kids BJJ for an 8-year-old on weeknights",
          objections: "Parents want schedule fit and safety, not technique detail.",
          talkingPoints:
            "Offer a specific weeknight trial slot for Kids Brazilian Jiu-Jitsu.\nMention no gi or gear needed for the first class.\nConfirm Ellie's age group and experience.",
          recommendedProgram: "Brazilian Jiu-Jitsu",
          suggestedFirstText:
            "Hi Dana, thanks for reaching out to Atheneum Martial Arts! I can get Ellie into a free Kids BJJ class this week. Does a weeknight or Saturday work better?",
        },
      },
      messages: {
        create: [
          {
            direction: "OUTBOUND",
            body: "Hi Dana, thanks for reaching out to Atheneum Martial Arts! I can get Ellie into a free Kids BJJ class this week. Does a weeknight or Saturday work better?",
            automated: true,
            stepOrder: 1,
            createdAt: minutesAgo(44),
          },
        ],
      },
      events: {
        create: [
          { type: "CREATED", summary: "Lead captured from FACEBOOK_ADS", createdAt: minutesAgo(46) },
          {
            type: "SMS_SENT",
            summary: "First follow-up text sent 2 min after the lead came in",
            createdAt: minutesAgo(44),
          },
        ],
      },
    },
  });
  await prisma.followUpTask.create({
    data: {
      leadId: dana.id,
      sequenceKey: "NEW_LEAD",
      stepOrder: 2,
      dueAt: new Date(Date.now() + 16 * 60_000),
    },
  });

  await prisma.lead.create({
    data: {
      fullName: "Marcus Cole (Sample)",
      phone: "+17635550188",
      source: "FACEBOOK_ADS",
      campaign: "Adult Muay Thai — 30 day challenge",
      interest: "Adult Muay Thai, asked about pricing",
      ageGroup: "ADULT",
      status: "ENGAGED",
      submittedAt: minutesAgo(300),
      firstContactedAt: minutesAgo(297),
      lastOutboundAt: minutesAgo(120),
      lastInboundAt: minutesAgo(121),
      pausedAt: minutesAgo(121),
      sequenceKey: "NEW_LEAD",
      sequenceStep: 2,
      insight: {
        create: {
          score: 88,
          temperature: "HOT",
          summary:
            "HOT lead (88/100): replied by text, asked about pricing, wants to train evenings.",
          intent: "Adult Muay Thai a few evenings a week",
          objections: "Asked about price — lead with the free trial, not the rate.",
          talkingPoints:
            "Offer Tuesday 7pm Muay Thai beginners.\nQuote the trial as free before mentioning monthly rates.\nAsk about his training history for class placement.",
          recommendedProgram: "Muay Thai",
          suggestedFirstText:
            "Hi Marcus, thanks for reaching out to Atheneum Martial Arts! I can get you into a free Muay Thai class this week — does a weeknight or Saturday work better?",
        },
      },
      messages: {
        create: [
          {
            direction: "OUTBOUND",
            body: "Hi Marcus, thanks for reaching out to Atheneum Martial Arts! I can get you into a free Muay Thai class this week — does a weeknight or Saturday work better?",
            automated: true,
            stepOrder: 1,
            createdAt: minutesAgo(297),
          },
          {
            direction: "INBOUND",
            body: "Weeknights are better. How much is it per month?",
            status: "RECEIVED",
            provider: "TWILIO",
            createdAt: minutesAgo(121),
          },
          {
            direction: "OUTBOUND",
            body: "Awesome, Marcus! A coach will text you in a few minutes to lock in a class time.",
            automated: true,
            createdAt: minutesAgo(120),
          },
        ],
      },
      events: {
        create: [
          { type: "CREATED", summary: "Lead captured from FACEBOOK_ADS", createdAt: minutesAgo(300) },
          {
            type: "SMS_SENT",
            summary: "First follow-up text sent 3 min after the lead came in",
            createdAt: minutesAgo(297),
          },
          { type: "SMS_RECEIVED", summary: "Lead replied by text", createdAt: minutesAgo(121) },
          {
            type: "PAUSED",
            summary: "Automated follow-up paused because the lead replied",
            createdAt: minutesAgo(121),
          },
        ],
      },
    },
  });

  const priya = await prisma.lead.create({
    data: {
      fullName: "Priya Raman (Sample)",
      phone: "+19525550117",
      email: "priya@example.com",
      source: "IMPORT",
      sourceRef: "sample-import",
      interest: "Self defense classes for myself",
      ageGroup: "ADULT",
      status: "NEW",
      submittedAt: daysFromNow(-124),
      insight: {
        create: {
          score: 34,
          temperature: "COLD",
          summary:
            "COLD lead (34/100): 124 days old, likely forgot the original ad, never contacted.",
          intent: "Self defense for herself",
          objections: "Cold lead: re-introduce the studio before asking for anything.",
          talkingPoints:
            "Open with a new beginner intake, not a thank-you for enquiring.\nKeep the first text to one question.\nSelf Defense Fundamentals is the natural fit.",
          recommendedProgram: "Self Defense",
          suggestedFirstText:
            "Hi Priya, it's Atheneum Martial Arts in Medina. You asked about self defense a while back — we just opened new beginner spots. Want me to hold one for you this week?",
        },
      },
      events: {
        create: [{ type: "CREATED", summary: "Lead captured from IMPORT" }],
      },
    },
  });
  await prisma.followUpTask.create({
    data: {
      leadId: priya.id,
      sequenceKey: "REACTIVATION",
      stepOrder: 1,
      dueAt: new Date(Date.now() + 2 * 60_000),
    },
  });
  await prisma.lead.update({
    where: { id: priya.id },
    data: { sequenceKey: "REACTIVATION" },
  });

  console.log("Seeded follow-up sequences and sample leads.");
}

const PLANS = [
  {
    name: "Adult Unlimited",
    description: "All adult BJJ, Muay Thai and Judo classes.",
    priceCents: 16900,
    sortOrder: 1,
  },
  {
    name: "Kids Unlimited",
    description: "All kids classes, any program.",
    priceCents: 13900,
    sortOrder: 2,
  },
  {
    name: "Two Classes / Week",
    description: "Two classes a week, any program.",
    priceCents: 11900,
    classesPerWeek: 2,
    sortOrder: 3,
  },
  {
    name: "10-Class Punch Pass",
    description: "Ten classes, no expiry.",
    priceCents: 20000,
    billingPeriod: "ONE_TIME",
    punchPassClasses: 10,
    sortOrder: 4,
  },
];

async function seedMembershipPlans() {
  for (const plan of PLANS) {
    await prisma.membershipPlan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
  }
}

/**
 * Gives the sample members real dues history so LTV, MRR and source attribution have something to
 * show, including one member converted from a Facebook lead so the growth table isn't empty.
 */
async function seedMemberships(profiles: {
  memberProfile: { id: string };
  parentProfile: { id: string };
  child1: { id: string };
  child2: { id: string };
}) {
  const plans = await prisma.membershipPlan.findMany();
  const planByName = new Map(plans.map((p) => [p.name, p]));
  const adult = planByName.get("Adult Unlimited")!;
  const kids = planByName.get("Kids Unlimited")!;
  const punchPass = planByName.get("10-Class Punch Pass")!;

  // Casey has been paying adult dues for 14 months — the studio's best-case retention.
  await prisma.memberProfile.update({
    where: { id: profiles.parentProfile.id },
    data: { joinedAt: daysFromNow(-425) },
  });
  const caseyMembership = await prisma.membership.create({
    data: {
      profileId: profiles.parentProfile.id,
      planId: adult.id,
      priceCents: adult.priceCents,
      startedAt: daysFromNow(-425),
      billingDay: 8,
      nextInvoiceAt: daysFromNow(18),
    },
  });
  for (let i = 13; i >= 0; i -= 1) {
    await prisma.payment.create({
      data: {
        profileId: profiles.parentProfile.id,
        membershipId: caseyMembership.id,
        amountCents: adult.priceCents,
        kind: "DUES",
        method: "STRIPE",
        description: "Adult Unlimited dues",
        paidAt: daysFromNow(-30 * i - 2),
        recordedBy: "seed",
      },
    });
  }

  // Riley came from a Facebook lead, so her dues are credited to that campaign.
  const rileyLead = await prisma.lead.upsert({
    where: { phone: "+19525550142" },
    update: {},
    create: {
      fullName: "Casey Smith",
      phone: "+19525550142",
      email: "casey.fb@example.com",
      source: "FACEBOOK",
      campaign: "Kids BJJ - Spring Trial",
      formName: "Kids Free Week",
      interest: "Kids BJJ for my 8 year old",
      ageGroup: "KID",
      childName: "Riley Smith (Sample Child)",
      status: "WON",
      submittedAt: daysFromNow(-212),
      firstContactedAt: new Date(daysFromNow(-212).getTime() + 3 * 60_000),
      pausedAt: daysFromNow(-205),
      events: {
        create: [
          { type: "CREATED", summary: "Lead captured from FACEBOOK" },
          { type: "CONVERTED", summary: "Signed up Riley Smith on Kids Unlimited" },
        ],
      },
    },
  });
  await prisma.memberProfile.update({
    where: { id: profiles.child1.id },
    data: { joinedAt: daysFromNow(-205), leadId: rileyLead.id },
  });
  const rileyMembership = await prisma.membership.create({
    data: {
      profileId: profiles.child1.id,
      planId: kids.id,
      priceCents: kids.priceCents,
      startedAt: daysFromNow(-205),
      billingDay: 1,
      nextInvoiceAt: daysFromNow(9),
    },
  });
  await prisma.payment.create({
    data: {
      profileId: profiles.child1.id,
      membershipId: rileyMembership.id,
      amountCents: 5000,
      kind: "SIGNUP_FEE",
      method: "CARD_TERMINAL",
      description: "Signup fee + gi",
      paidAt: daysFromNow(-205),
      recordedBy: "seed",
    },
  });
  for (let i = 6; i >= 0; i -= 1) {
    await prisma.payment.create({
      data: {
        profileId: profiles.child1.id,
        membershipId: rileyMembership.id,
        amountCents: kids.priceCents,
        kind: "DUES",
        method: "STRIPE",
        description: "Kids Unlimited dues",
        paidAt: daysFromNow(-30 * i - 1),
        recordedBy: "seed",
      },
    });
  }

  // Avery's card failed this month: past due is the state the studio needs to see and chase.
  const averyMembership = await prisma.membership.create({
    data: {
      profileId: profiles.child2.id,
      planId: kids.id,
      priceCents: kids.priceCents,
      status: "PAST_DUE",
      startedAt: daysFromNow(-96),
      billingDay: 14,
    },
  });
  await prisma.payment.createMany({
    data: [
      {
        profileId: profiles.child2.id,
        membershipId: averyMembership.id,
        amountCents: kids.priceCents,
        kind: "DUES",
        method: "STRIPE",
        description: "Kids Unlimited dues",
        paidAt: daysFromNow(-66),
        recordedBy: "seed",
      },
      {
        profileId: profiles.child2.id,
        membershipId: averyMembership.id,
        amountCents: kids.priceCents,
        kind: "DUES",
        status: "FAILED",
        method: "STRIPE",
        description: "Card declined",
        paidAt: daysFromNow(-4),
        recordedBy: "seed",
      },
    ],
  });

  // Jordan bought a punch pass instead of signing up for dues.
  await prisma.memberProfile.update({
    where: { id: profiles.memberProfile.id },
    data: { joinedAt: daysFromNow(-38) },
  });
  const jordanMembership = await prisma.membership.create({
    data: {
      profileId: profiles.memberProfile.id,
      planId: punchPass.id,
      priceCents: punchPass.priceCents,
      startedAt: daysFromNow(-38),
    },
  });
  await prisma.payment.create({
    data: {
      profileId: profiles.memberProfile.id,
      membershipId: jordanMembership.id,
      amountCents: punchPass.priceCents,
      kind: "PUNCH_PASS",
      method: "CASH",
      description: "10-class punch pass",
      paidAt: daysFromNow(-38),
      recordedBy: "seed",
    },
  });

  console.log("Seeded membership plans, memberships and payment history.");
}

async function ensureAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
  if (existing) return;
  const household = await prisma.household.create({ data: { name: "Admin Household" } });
  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("atheneum123", 10),
      name: "Alex Admin (Sample)",
      role: "ADMIN",
      householdId: household.id,
    },
  });
  await prisma.memberProfile.create({
    data: {
      name: "Alex Admin (Sample)",
      userId: admin.id,
      householdId: household.id,
      experienceLevel: "ADVANCED",
    },
  });
  console.log("Seeded admin account.");
}

async function capCapacities() {
  const { count } = await prisma.classTemplate.updateMany({
    where: { capacity: { gt: 12 } },
    data: { capacity: 12 },
  });
  if (count > 0) console.log(`Capped ${count} class capacities at 12.`);
}

async function main() {
  await seedProducts();
  await seedMembershipPlans();
  await seedFollowUpBot();
  await capCapacities();

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0 && !(await resetIfOutdatedSchedule())) {
    await ensureAdmin();
    console.log("Database already has users — skipping seed.");
    return;
  }

  const password = await bcrypt.hash("atheneum123", 10);

  const smithHousehold = await prisma.household.create({ data: { name: "Smith Household" } });
  const leeHousehold = await prisma.household.create({ data: { name: "Lee Household" } });

  const member = await prisma.user.create({
    data: {
      email: "member@example.com",
      passwordHash: password,
      name: "Jordan Lee",
      role: "MEMBER",
      householdId: leeHousehold.id,
    },
  });
  const memberProfile = await prisma.memberProfile.create({
    data: {
      name: "Jordan Lee",
      userId: member.id,
      householdId: leeHousehold.id,
      experienceLevel: "BEGINNER",
      weeklyGoal: 3,
      membershipPlan: "10-Class Punch Pass",
      membershipType: "PUNCH_PASS",
      punchPassTotal: 10,
      punchPassUsed: 2,
    },
  });

  const parent = await prisma.user.create({
    data: {
      email: "parent@example.com",
      passwordHash: password,
      name: "Casey Smith",
      role: "PARENT",
      householdId: smithHousehold.id,
    },
  });
  const parentProfile = await prisma.memberProfile.create({
    data: {
      name: "Casey Smith",
      userId: parent.id,
      householdId: smithHousehold.id,
      experienceLevel: "INTERMEDIATE",
      weeklyGoal: 2,
      membershipPlan: "Adult Unlimited",
      membershipType: "MONTHLY",
      membershipRenewsAt: daysFromNow(18),
    },
  });
  const child1 = await prisma.memberProfile.create({
    data: {
      name: "Riley Smith (Sample Child)",
      isChild: true,
      birthYear: 2017,
      householdId: smithHousehold.id,
      weeklyGoal: 2,
      membershipPlan: "Kids Unlimited",
      membershipType: "MONTHLY",
      membershipRenewsAt: daysFromNow(9),
    },
  });
  const child2 = await prisma.memberProfile.create({
    data: {
      name: "Avery Smith (Sample Child)",
      isChild: true,
      birthYear: 2014,
      householdId: smithHousehold.id,
      weeklyGoal: 2,
      membershipPlan: "10-Class Punch Pass",
      membershipType: "PUNCH_PASS",
      punchPassTotal: 10,
      punchPassUsed: 6,
    },
  });

  const coachHousehold = await prisma.household.create({ data: { name: "Coach Household" } });
  const coach = await prisma.user.create({
    data: {
      email: "coach@example.com",
      passwordHash: password,
      name: "Coach Sam (Sample)",
      role: "COACH",
      householdId: coachHousehold.id,
    },
  });
  await prisma.memberProfile.create({
    data: {
      name: "Coach Sam (Sample)",
      userId: coach.id,
      householdId: coachHousehold.id,
      experienceLevel: "ADVANCED",
    },
  });

  await seedMemberships({ memberProfile, parentProfile, child1, child2 });
  await ensureAdmin();

  const bjj = await prisma.program.create({
    data: {
      name: "Brazilian Jiu-Jitsu",
      description: "Grappling and ground fighting for all levels, gi and no gi.",
      color: "blue",
    },
  });
  const muayThai = await prisma.program.create({
    data: {
      name: "Muay Thai",
      description: "Striking with punches, kicks, elbows, and knees.",
      color: "red",
    },
  });
  const judo = await prisma.program.create({
    data: {
      name: "Judo",
      description: "Throws, takedowns, and pins in the gi.",
      color: "purple",
    },
  });
  const privateTraining = await prisma.program.create({
    data: {
      name: "Private Training",
      description: "One-on-one and small-group sessions with a coach.",
      color: "green",
    },
  });

  const kidsGiBjjFund = await prisma.classTemplate.create({
    data: {
      name: "Kids Gi BJJ (Fundamentals)",
      description: "Core gi grappling fundamentals for young athletes.",
      ageGroup: "KIDS",
      level: "BEGINNER",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Gi required. Loaner gis available — just ask at the front desk.",
      programId: bjj.id,
    },
  });
  const kidsNoGiFund = await prisma.classTemplate.create({
    data: {
      name: "Kids No Gi BJJ (Fundamentals)",
      description: "No gi grappling fundamentals for young athletes.",
      ageGroup: "KIDS",
      level: "BEGINNER",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Rash guard or fitted t-shirt and shorts. No pockets or zippers.",
      programId: bjj.id,
    },
  });
  const kidsNoGiAdv = await prisma.classTemplate.create({
    data: {
      name: "Kids No Gi BJJ (Advanced)",
      description: "Higher-intensity no gi training for experienced kids.",
      ageGroup: "KIDS",
      level: "ADVANCED",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Rash guard or fitted t-shirt and shorts. Coach approval required.",
      programId: bjj.id,
    },
  });
  const curiousCubs = await prisma.classTemplate.create({
    data: {
      name: "Curious Cubs No Gi BJJ (Age 4-6)",
      description: "Playful intro to grappling for our youngest athletes, ages 4-6.",
      ageGroup: "KIDS",
      level: "BEGINNER",
      capacity: 10,
      durationMin: 45,
      gearNotes: "Comfortable athletic clothes and a water bottle.",
      programId: bjj.id,
    },
  });
  const noGiBjj = await prisma.classTemplate.create({
    data: {
      name: "No Gi BJJ",
      description: "No gi technique, drilling, and live rounds for all levels.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Rash guard or fitted t-shirt and shorts. No pockets or zippers.",
      programId: bjj.id,
    },
  });
  const giBjj = await prisma.classTemplate.create({
    data: {
      name: "Gi BJJ",
      description: "Gi technique, drilling, and live rounds for all levels.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Gi required. Loaner gis available — just ask at the front desk.",
      programId: bjj.id,
    },
  });
  const muayThaiAll = await prisma.classTemplate.create({
    data: {
      name: "Muay Thai",
      description: "Pad work, partner drills, and conditioning.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Hand wraps and gloves. Loaner gloves available.",
      programId: muayThai.id,
    },
  });
  const muayThaiSparring = await prisma.classTemplate.create({
    data: {
      name: "Muay Thai Sparring",
      description: "Supervised sparring rounds for experienced members.",
      ageGroup: "ADULTS",
      level: "ADVANCED",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Full sparring gear: gloves, shin guards, and mouthguard. Coach approval required.",
      programId: muayThai.id,
    },
  });
  const kidsMuayThai = await prisma.classTemplate.create({
    data: {
      name: "Kids Muay Thai (Fundamentals)",
      description: "Striking fundamentals for young athletes.",
      ageGroup: "KIDS",
      level: "BEGINNER",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Hand wraps and gloves. Loaner gloves available.",
      programId: muayThai.id,
    },
  });
  const cardioKickboxing = await prisma.classTemplate.create({
    data: {
      name: "Cardio Kickboxing",
      description: "High-energy conditioning built around kickboxing combinations.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Hand wraps and gloves recommended. Water bottle a must.",
      programId: muayThai.id,
    },
  });
  const kidsJudo = await prisma.classTemplate.create({
    data: {
      name: "Kids Judo (All Ages) (Gi)",
      description: "Throws, breakfalls, and pins for kids of all ages.",
      ageGroup: "KIDS",
      level: "ALL",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Gi required. Loaner gis available — just ask at the front desk.",
      programId: judo.id,
    },
  });
  const judoAdults = await prisma.classTemplate.create({
    data: {
      name: "Judo",
      description: "Throws, takedowns, and groundwork in the gi for all levels.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 12,
      durationMin: 60,
      gearNotes: "Gi required.",
      programId: judo.id,
    },
  });
  const privateSessions = await prisma.classTemplate.create({
    data: {
      name: "Private Sessions",
      description: "Book one-on-one time with a coach. Contact the front desk to schedule.",
      ageGroup: "ALL",
      level: "ALL",
      capacity: 6,
      durationMin: 60,
      gearNotes: "Gear depends on your focus — your coach will confirm.",
      programId: privateTraining.id,
    },
  });

  const instructors = ["Atheneum Coaches"];
  // Weekly schedule as of 08/01/2026 (day: 0=Sun ... 6=Sat)
  const sessions: { templateId: string; day: number; hour: number; minute: number; instructor: string }[] = [
    // Monday
    { templateId: kidsGiBjjFund.id, day: 1, hour: 17, minute: 15, instructor: instructors[0] },
    { templateId: muayThaiAll.id, day: 1, hour: 18, minute: 15, instructor: instructors[0] },
    { templateId: noGiBjj.id, day: 1, hour: 19, minute: 15, instructor: instructors[0] },
    // Tuesday
    { templateId: kidsNoGiFund.id, day: 2, hour: 16, minute: 15, instructor: instructors[0] },
    { templateId: kidsNoGiAdv.id, day: 2, hour: 17, minute: 15, instructor: instructors[0] },
    { templateId: noGiBjj.id, day: 2, hour: 18, minute: 15, instructor: instructors[0] },
    // Wednesday
    { templateId: kidsJudo.id, day: 3, hour: 17, minute: 15, instructor: instructors[0] },
    { templateId: judoAdults.id, day: 3, hour: 18, minute: 15, instructor: instructors[0] },
    { templateId: privateSessions.id, day: 3, hour: 19, minute: 15, instructor: instructors[0] },
    // Thursday
    { templateId: kidsMuayThai.id, day: 4, hour: 18, minute: 15, instructor: instructors[0] },
    { templateId: cardioKickboxing.id, day: 4, hour: 19, minute: 15, instructor: instructors[0] },
    // Friday
    { templateId: kidsNoGiFund.id, day: 5, hour: 17, minute: 15, instructor: instructors[0] },
    { templateId: muayThaiAll.id, day: 5, hour: 18, minute: 15, instructor: instructors[0] },
    { templateId: muayThaiSparring.id, day: 5, hour: 19, minute: 15, instructor: instructors[0] },
    // Saturday
    { templateId: giBjj.id, day: 6, hour: 11, minute: 0, instructor: instructors[0] },
    { templateId: privateSessions.id, day: 6, hour: 12, minute: 0, instructor: instructors[0] },
    // Sunday
    { templateId: curiousCubs.id, day: 0, hour: 14, minute: 15, instructor: instructors[0] },
    { templateId: kidsGiBjjFund.id, day: 0, hour: 15, minute: 0, instructor: instructors[0] },
    { templateId: kidsNoGiAdv.id, day: 0, hour: 16, minute: 0, instructor: instructors[0] },
  ];

  const createdSessions: { id: string; templateId: string; startsAt: Date }[] = [];
  for (const weekOffset of [0, 1]) {
    for (const s of sessions) {
      const created = await prisma.classSession.create({
        data: {
          templateId: s.templateId,
          startsAt: nextDateAt(s.day, s.hour, s.minute, weekOffset),
          instructor: s.instructor,
        },
      });
      createdSessions.push({ id: created.id, templateId: created.templateId, startsAt: created.startsAt });
    }
  }

  const upcoming = createdSessions
    .filter((s) => s.startsAt > new Date())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const firstAdult = upcoming.find((s) =>
    [noGiBjj.id, giBjj.id, muayThaiAll.id, judoAdults.id].includes(s.templateId)
  );
  if (firstAdult) {
    await prisma.booking.create({
      data: { profileId: memberProfile.id, sessionId: firstAdult.id },
    });
  }
  const firstKids = upcoming.find((s) => s.templateId === kidsGiBjjFund.id);
  if (firstKids) {
    await prisma.booking.create({
      data: { profileId: child1.id, sessionId: firstKids.id },
    });
  }

  // Past attendance for progress views
  const pastSession1 = await prisma.classSession.create({
    data: {
      templateId: noGiBjj.id,
      startsAt: nextDateAt(1, 19, 15, -1),
      instructor: instructors[0],
    },
  });
  const pastSession2 = await prisma.classSession.create({
    data: {
      templateId: muayThaiAll.id,
      startsAt: nextDateAt(5, 18, 15, -1),
      instructor: instructors[0],
    },
  });
  for (const past of [pastSession1, pastSession2]) {
    await prisma.attendance.create({
      data: { profileId: memberProfile.id, sessionId: past.id, recordedBy: "Coach Sam (Sample)" },
    });
  }
  const pastKids = await prisma.classSession.create({
    data: {
      templateId: kidsGiBjjFund.id,
      startsAt: nextDateAt(1, 17, 15, -1),
      instructor: instructors[0],
    },
  });
  await prisma.attendance.create({
    data: { profileId: child1.id, sessionId: pastKids.id, recordedBy: "Coach Sam (Sample)" },
  });

  await prisma.milestone.create({
    data: {
      profileId: memberProfile.id,
      title: "First class completed",
      notes: "Great first session — welcome to the tribe!",
      awardedBy: "Coach Sam (Sample)",
    },
  });
  await prisma.milestone.create({
    data: {
      profileId: child1.id,
      title: "First stripe (sample)",
      notes: "Consistent effort and great listening.",
      awardedBy: "Coach Sam (Sample)",
    },
  });

  await prisma.announcement.create({
    data: {
      title: "Welcome to the Atheneum member portal",
      body: "The real weekly class schedule (as of 08/01/2026) is now live. Member accounts are still sample data until the roster is loaded.",
      audience: "ALL",
      author: "Atheneum Staff",
    },
  });
  await prisma.announcement.create({
    data: {
      title: "Private sessions",
      body: "Private sessions run Wednesdays at 7:15 PM and Saturdays at 12 PM. Contact the front desk to book time with a coach.",
      audience: "ALL",
      author: "Atheneum Staff",
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
