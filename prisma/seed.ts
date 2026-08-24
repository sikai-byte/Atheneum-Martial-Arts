import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function nextDateAt(dayOfWeek: number, hour: number, minute: number, weekOffset = 0) {
  const now = new Date();
  const d = new Date(now);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  d.setDate(now.getDate() + diff + weekOffset * 7);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
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
    },
  });
  const child1 = await prisma.memberProfile.create({
    data: {
      name: "Riley Smith (Sample Child)",
      isChild: true,
      birthYear: 2017,
      householdId: smithHousehold.id,
      weeklyGoal: 2,
    },
  });
  const child2 = await prisma.memberProfile.create({
    data: {
      name: "Avery Smith (Sample Child)",
      isChild: true,
      birthYear: 2014,
      householdId: smithHousehold.id,
      weeklyGoal: 2,
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

  const bjj = await prisma.program.create({
    data: {
      name: "Brazilian Jiu-Jitsu",
      description: "Grappling and ground fighting for all levels.",
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
  const mma = await prisma.program.create({
    data: {
      name: "Mixed Martial Arts",
      description: "Blended striking and grappling training.",
      color: "purple",
    },
  });
  const kids = await prisma.program.create({
    data: {
      name: "Kids Martial Arts",
      description: "Age-appropriate martial arts for young athletes.",
      color: "green",
    },
  });

  const bjjFundamentals = await prisma.classTemplate.create({
    data: {
      name: "BJJ Fundamentals",
      description: "Core positions, escapes, and submissions. Perfect for your first class.",
      ageGroup: "ADULTS",
      level: "BEGINNER",
      capacity: 16,
      durationMin: 60,
      gearNotes: "Gi required. Loaner gis available — just ask at the front desk.",
      programId: bjj.id,
    },
  });
  const bjjAllLevels = await prisma.classTemplate.create({
    data: {
      name: "BJJ All Levels",
      description: "Technique, drilling, and situational rounds for every experience level.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 20,
      durationMin: 75,
      gearNotes: "Gi required.",
      programId: bjj.id,
    },
  });
  const muayThaiFund = await prisma.classTemplate.create({
    data: {
      name: "Muay Thai Fundamentals",
      description: "Stance, footwork, and basic strikes. Great starting point.",
      ageGroup: "ADULTS",
      level: "BEGINNER",
      capacity: 18,
      durationMin: 60,
      gearNotes: "Hand wraps and gloves. Loaner gloves available.",
      programId: muayThai.id,
    },
  });
  const muayThaiAll = await prisma.classTemplate.create({
    data: {
      name: "Muay Thai",
      description: "Pad work, partner drills, and conditioning.",
      ageGroup: "ADULTS",
      level: "ALL",
      capacity: 18,
      durationMin: 60,
      gearNotes: "Hand wraps, gloves, and shin guards for sparring rounds.",
      programId: muayThai.id,
    },
  });
  const kidsBjj = await prisma.classTemplate.create({
    data: {
      name: "Kids BJJ",
      description: "Fun, safe grappling fundamentals for ages 6-12.",
      ageGroup: "KIDS",
      level: "ALL",
      capacity: 14,
      durationMin: 45,
      gearNotes: "Gi required. Water bottle recommended.",
      programId: kids.id,
    },
  });
  const compTraining = await prisma.classTemplate.create({
    data: {
      name: "Competition Training",
      description: "Higher-intensity rounds for members preparing to compete.",
      ageGroup: "ADULTS",
      level: "COMPETITION",
      capacity: 12,
      durationMin: 75,
      gearNotes: "Full sparring gear.",
      programId: mma.id,
    },
  });

  const instructors = ["Coach Sam (Sample)", "Coach Alex (Sample)"];
  const sessions: { templateId: string; day: number; hour: number; minute: number; instructor: string }[] = [
    { templateId: bjjFundamentals.id, day: 1, hour: 18, minute: 0, instructor: instructors[0] },
    { templateId: bjjFundamentals.id, day: 3, hour: 18, minute: 0, instructor: instructors[0] },
    { templateId: bjjAllLevels.id, day: 2, hour: 19, minute: 0, instructor: instructors[0] },
    { templateId: bjjAllLevels.id, day: 6, hour: 10, minute: 0, instructor: instructors[1] },
    { templateId: muayThaiFund.id, day: 1, hour: 19, minute: 15, instructor: instructors[1] },
    { templateId: muayThaiAll.id, day: 4, hour: 18, minute: 30, instructor: instructors[1] },
    { templateId: kidsBjj.id, day: 1, hour: 17, minute: 0, instructor: instructors[0] },
    { templateId: kidsBjj.id, day: 4, hour: 17, minute: 0, instructor: instructors[0] },
    { templateId: compTraining.id, day: 5, hour: 18, minute: 0, instructor: instructors[0] },
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
    [bjjFundamentals.id, bjjAllLevels.id, muayThaiFund.id, muayThaiAll.id].includes(s.templateId)
  );
  if (firstAdult) {
    await prisma.booking.create({
      data: { profileId: memberProfile.id, sessionId: firstAdult.id },
    });
  }
  const firstKids = upcoming.find((s) => s.templateId === kidsBjj.id);
  if (firstKids) {
    await prisma.booking.create({
      data: { profileId: child1.id, sessionId: firstKids.id },
    });
  }

  // Past attendance for progress views
  const pastSession1 = await prisma.classSession.create({
    data: {
      templateId: bjjFundamentals.id,
      startsAt: nextDateAt(1, 18, 0, -1),
      instructor: instructors[0],
    },
  });
  const pastSession2 = await prisma.classSession.create({
    data: {
      templateId: muayThaiFund.id,
      startsAt: nextDateAt(3, 19, 15, -1),
      instructor: instructors[1],
    },
  });
  for (const past of [pastSession1, pastSession2]) {
    await prisma.attendance.create({
      data: { profileId: memberProfile.id, sessionId: past.id, recordedBy: "Coach Sam (Sample)" },
    });
  }
  const pastKids = await prisma.classSession.create({
    data: {
      templateId: kidsBjj.id,
      startsAt: nextDateAt(4, 17, 0, -1),
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
      title: "Welcome to the Atheneum member portal (sample data)",
      body: "This portal uses clearly-labeled sample data until the real schedule and roster are loaded.",
      audience: "ALL",
      author: "Atheneum Staff",
    },
  });
  await prisma.announcement.create({
    data: {
      title: "Open mat this Saturday",
      body: "Open mat after the 10:00 AM BJJ All Levels class. All members welcome.",
      audience: "ADULTS",
      author: "Coach Sam (Sample)",
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
