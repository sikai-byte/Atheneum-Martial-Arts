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

async function seedCoaches() {
  const existing = await prisma.coachProfile.count();
  if (existing > 0) return;
  const coaches = [
    {
      name: "Coach DJ",
      role: "MAIN",
      disciplines: "Judo,Gi BJJ,Kids Judo",
      bio: "Coach DJ leads our Judo and Gi BJJ programs, bringing a throw-first, position-second approach to the mats. He loves building fundamentals with the kids' Judo class and sharpening grip fighting with the adults.",
      sortOrder: 1,
    },
    {
      name: "Coach Jair",
      role: "MAIN",
      disciplines: "No-Gi BJJ,BJJ Comp Training,Kids BJJ",
      bio: "Coach Jair runs our No-Gi BJJ and competition training programs. If you're chasing medals, his comp class is where you level up — and he brings the same energy to our kids' BJJ program.",
      sortOrder: 2,
    },
    {
      name: "Coach Shannon",
      role: "MAIN",
      disciplines: "Muay Thai,Fitness Kickboxing,Kids Muay Thai",
      bio: "Coach Shannon heads up Muay Thai and Fitness Kickboxing. Whether you're here to fight or to sweat, her pad rounds will push you — and the kids' Muay Thai class is one of the most fun hours in the gym.",
      sortOrder: 3,
    },
    {
      name: "Coach Kazim",
      role: "MAIN",
      disciplines: "MMA,Kids MMA",
      bio: "Coach Kazim leads our MMA program, blending striking, wrestling, and grappling into complete mixed martial arts training for adults and kids alike.",
      sortOrder: 4,
    },
    {
      name: "Coach Trey",
      role: "MAIN",
      disciplines: "Muay Thai,No-Gi BJJ,Kids BJJ",
      bio: "Coach Trey splits his time between Muay Thai and No-Gi BJJ, and helps coach our kids' BJJ classes. Expect crisp technique and plenty of rounds.",
      sortOrder: 5,
    },
    {
      name: "Coach Sikai",
      role: "MAIN",
      disciplines: "Gi & No-Gi BJJ,Muay Thai,Kids BJJ,Kids Muay Thai",
      bio: "Coach Sikai teaches across our Gi and No-Gi BJJ and Muay Thai programs, and coaches both kids' BJJ and kids' Muay Thai. Train for life — your only limit is your tribe.",
      sortOrder: 6,
    },
    { name: "Coach Jacob", role: "ASSISTANT", disciplines: "", bio: "", sortOrder: 7 },
    { name: "Coach Reese", role: "ASSISTANT", disciplines: "", bio: "", sortOrder: 8 },
    { name: "Coach James", role: "ASSISTANT", disciplines: "", bio: "", sortOrder: 9 },
    { name: "Coach Blake", role: "ASSISTANT", disciplines: "", bio: "", sortOrder: 10 },
  ];
  for (const c of coaches) {
    await prisma.coachProfile.create({ data: c });
  }
  console.log("Seeded coach profiles.");
}

const weeklySlots: { templateName: string; day: number; hour: number; minute: number }[] = [
  // Monday
  { templateName: "Kids Gi BJJ (Fundamentals)", day: 1, hour: 17, minute: 15 },
  { templateName: "Muay Thai", day: 1, hour: 18, minute: 15 },
  { templateName: "No Gi BJJ", day: 1, hour: 19, minute: 15 },
  // Tuesday
  { templateName: "Kids No Gi BJJ (Fundamentals)", day: 2, hour: 16, minute: 15 },
  { templateName: "Kids No Gi BJJ (Advanced)", day: 2, hour: 17, minute: 15 },
  { templateName: "No Gi BJJ", day: 2, hour: 18, minute: 15 },
  // Wednesday
  { templateName: "Kids Judo (All Ages) (Gi)", day: 3, hour: 17, minute: 15 },
  { templateName: "Judo", day: 3, hour: 18, minute: 15 },
  { templateName: "Private Sessions", day: 3, hour: 19, minute: 15 },
  // Thursday
  { templateName: "Kids Muay Thai (Fundamentals)", day: 4, hour: 18, minute: 15 },
  { templateName: "Cardio Kickboxing", day: 4, hour: 19, minute: 15 },
  // Friday
  { templateName: "Kids No Gi BJJ (Fundamentals)", day: 5, hour: 17, minute: 15 },
  { templateName: "Muay Thai", day: 5, hour: 18, minute: 15 },
  { templateName: "Muay Thai Sparring", day: 5, hour: 19, minute: 15 },
  // Saturday
  { templateName: "Gi BJJ", day: 6, hour: 11, minute: 0 },
  { templateName: "Private Sessions", day: 6, hour: 12, minute: 0 },
  // Sunday
  { templateName: "Curious Cubs No Gi BJJ (Age 4-6)", day: 0, hour: 14, minute: 15 },
  { templateName: "Kids Gi BJJ (Fundamentals)", day: 0, hour: 15, minute: 0 },
  { templateName: "Kids No Gi BJJ (Advanced)", day: 0, hour: 16, minute: 0 },
];

async function seedRecurringSlots() {
  const existing = await prisma.recurringSlot.count();
  if (existing > 0) return;
  const templates = await prisma.classTemplate.findMany();
  const byName = new Map(templates.map((t) => [t.name, t.id]));
  for (const slot of weeklySlots) {
    const templateId = byName.get(slot.templateName);
    if (!templateId) continue;
    await prisma.recurringSlot.create({
      data: {
        templateId,
        dayOfWeek: slot.day,
        hour: slot.hour,
        minute: slot.minute,
        instructor: "Atheneum Coaches",
      },
    });
  }
  console.log("Seeded recurring weekly slots.");
}

async function ensureAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } });
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

async function main() {
  await seedProducts();
  await seedCoaches();

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0 && !(await resetIfOutdatedSchedule())) {
    await ensureAdmin();
    await seedRecurringSlots();
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

  await seedRecurringSlots();

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
