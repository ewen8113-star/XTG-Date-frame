import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { briefings, brokers, importBatches } from "../src/data/mockData";

const prisma = new PrismaClient();

function realNameStatus(status: string) {
  if (status === "已认证") return "VERIFIED";
  if (status === "认证中") return "PENDING";
  if (status === "认证失败") return "FAILED";
  return "UNVERIFIED";
}

function accountStatus(status: string) {
  if (status === "限制发布") return "LIMITED";
  if (status === "临时封号") return "TEMP_BANNED";
  if (status === "永久封号") return "PERM_BANNED";
  return "NORMAL";
}

function reviewStatus(status: string) {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  return "PENDING";
}

function parseDateTime(value?: string) {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(normalized.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const firstBatch = importBatches[0];

  await prisma.importBatch.upsert({
    where: { id: firstBatch.id },
    update: {
      title: firstBatch.title,
      source: firstBatch.source,
      operatorName: firstBatch.operatorName,
      brokerCount: firstBatch.brokerCount,
      briefingCount: firstBatch.briefingCount,
      importedAt: parseDateTime(firstBatch.importedAt) ?? new Date()
    },
    create: {
      id: firstBatch.id,
      title: firstBatch.title,
      source: firstBatch.source,
      operatorName: firstBatch.operatorName,
      brokerCount: firstBatch.brokerCount,
      briefingCount: firstBatch.briefingCount,
      importedAt: parseDateTime(firstBatch.importedAt) ?? new Date()
    }
  });

  for (const broker of brokers) {
    await prisma.broker.upsert({
      where: { miniProgramUserId: broker.miniProgramUserId },
      update: {
        nickname: broker.nickname,
        wechatPhone: broker.wechatPhone,
        boundPhone: broker.boundPhone,
        realNameStatus: realNameStatus(broker.realNameStatus),
        accountStatus: accountStatus(broker.accountStatus),
        brokerLevel: broker.brokerLevel === "seed" ? "SEED" : "NORMAL",
        seedPhase: broker.seedPhase,
        seedProgramJoinedAt: parseDateTime(broker.seedProgramJoinedAt),
        referralUnlocked: broker.referralUnlocked,
        registeredAt: parseDateTime(broker.registeredAt),
        lastLoginAt: parseDateTime(broker.lastLoginAt),
        violationCount: broker.violationCount
      },
      create: {
        id: broker.id,
        miniProgramUserId: broker.miniProgramUserId,
        nickname: broker.nickname,
        wechatPhone: broker.wechatPhone,
        boundPhone: broker.boundPhone,
        realNameStatus: realNameStatus(broker.realNameStatus),
        accountStatus: accountStatus(broker.accountStatus),
        brokerLevel: broker.brokerLevel === "seed" ? "SEED" : "NORMAL",
        seedPhase: broker.seedPhase,
        seedProgramJoinedAt: parseDateTime(broker.seedProgramJoinedAt),
        referralUnlocked: broker.referralUnlocked,
        registeredAt: parseDateTime(broker.registeredAt),
        lastLoginAt: parseDateTime(broker.lastLoginAt),
        violationCount: broker.violationCount
      }
    });

    await prisma.brokerSnapshot.upsert({
      where: {
        brokerId_importBatchId: {
          brokerId: broker.id,
          importBatchId: importBatches[0].id
        }
      },
      update: {
        publishedBriefings: broker.publishedBriefings,
        completedBriefings: broker.completedBriefings,
        signupTotalTimes: broker.signupTotalTimes,
        contractTotalTimes: broker.contractTotalTimes,
        signupTotalPeople: broker.signupTotalPeople,
        contractTotalPeople: broker.contractTotalPeople,
        violationCount: broker.violationCount
      },
      create: {
        brokerId: broker.id,
        importBatchId: importBatches[0].id,
        publishedBriefings: broker.publishedBriefings,
        completedBriefings: broker.completedBriefings,
        signupTotalTimes: broker.signupTotalTimes,
        contractTotalTimes: broker.contractTotalTimes,
        signupTotalPeople: broker.signupTotalPeople,
        contractTotalPeople: broker.contractTotalPeople,
        violationCount: broker.violationCount
      }
    });
  }

  for (const batch of importBatches) {
    await prisma.importBatch.upsert({
      where: { id: batch.id },
      update: {
        title: batch.title,
        source: batch.source,
        operatorName: batch.operatorName,
        brokerCount: batch.brokerCount,
        briefingCount: batch.briefingCount,
        importedAt: parseDateTime(batch.importedAt) ?? new Date()
      },
      create: {
        id: batch.id,
        title: batch.title,
        source: batch.source,
        operatorName: batch.operatorName,
        brokerCount: batch.brokerCount,
        briefingCount: batch.briefingCount,
        importedAt: parseDateTime(batch.importedAt) ?? new Date()
      }
    });
  }

  for (const briefing of briefings) {
    await prisma.briefing.upsert({
      where: { jarvisBriefingId: briefing.jarvisBriefingId },
      update: {
        title: briefing.title,
        recruitmentType: briefing.recruitmentType,
        genderRequirement: briefing.genderRequirement,
        recruitCount: briefing.recruitCount,
        workAddress: briefing.workAddress,
        publishedAt: parseDateTime(briefing.publishedAt),
        salaryText: briefing.salaryText,
        sourceStatus: briefing.sourceStatus
      },
      create: {
        id: briefing.id,
        jarvisBriefingId: briefing.jarvisBriefingId,
        brokerId: briefing.brokerId,
        title: briefing.title,
        recruitmentType: briefing.recruitmentType,
        genderRequirement: briefing.genderRequirement,
        recruitCount: briefing.recruitCount,
        workAddress: briefing.workAddress,
        publishedAt: parseDateTime(briefing.publishedAt),
        salaryText: briefing.salaryText,
        sourceStatus: briefing.sourceStatus
      }
    });

    await prisma.briefingSnapshot.upsert({
      where: {
        briefingId_importBatchId: {
          briefingId: briefing.id,
          importBatchId: firstBatch.id
        }
      },
      update: {
        signupTimes: briefing.signupTimes,
        contractTimes: briefing.contractTimes,
        signupPeople: briefing.signupPeople,
        contractPeople: briefing.contractPeople,
        sourceStatus: briefing.sourceStatus
      },
      create: {
        briefingId: briefing.id,
        importBatchId: firstBatch.id,
        signupTimes: briefing.signupTimes,
        contractTimes: briefing.contractTimes,
        signupPeople: briefing.signupPeople,
        contractPeople: briefing.contractPeople,
        sourceStatus: briefing.sourceStatus
      }
    });

    await prisma.briefingReview.upsert({
      where: { briefingId: briefing.id },
      update: {
        validPublishStatus: reviewStatus(briefing.validPublishStatus),
        validCompleteStatus: reviewStatus(briefing.validCompleteStatus)
      },
      create: {
        briefingId: briefing.id,
        validPublishStatus: reviewStatus(briefing.validPublishStatus),
        validCompleteStatus: reviewStatus(briefing.validCompleteStatus)
      }
    });
  }

  console.log("Seeded XTG review admin database.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
