import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { testBriefings, testBrokers, testSigners } from "./test-data";

const prisma = new PrismaClient();
const importedAt = new Date("2026-07-14T09:00:00+08:00");

function signerLabel(signerId: string) {
  const signer = testSigners.find((item) => item.id === signerId);
  if (!signer) throw new Error(`Unknown signer: ${signerId}`);
  return `${signer.nickname}（${signer.phone}） #${signer.userId}`;
}

function detailText(briefing: (typeof testBriefings)[number]) {
  return JSON.stringify({
    __xtgDetail: 1,
    cancelReason: briefing.cancelReason ?? "",
    requirementText: "测试要求：按时到场，服从现场安排，资料与本人一致。",
    publisherText: "测试数据专用发布者",
    workDateText: briefing.workDate,
    workTimeText: briefing.workTime,
    signedModelNames: (briefing.signers ?? []).map(signerLabel),
    rawText: "TEST_FIXTURE"
  });
}

async function clearBusinessData() {
  await prisma.briefingSigner.deleteMany();
  await prisma.settlementItem.deleteMany();
  await prisma.settlementCycle.deleteMany();
  await prisma.evidenceFile.deleteMany();
  await prisma.briefingReview.deleteMany();
  await prisma.briefingSnapshot.deleteMany();
  await prisma.briefing.deleteMany();
  await prisma.referralRelation.deleteMany();
  await prisma.promotionRecord.deleteMany();
  await prisma.brokerSnapshot.deleteMany();
  await prisma.signerProfile.deleteMany();
  await prisma.broker.deleteMany();
  await prisma.importBatch.deleteMany();
}

async function seedSigners() {
  for (const [index, signer] of testSigners.entries()) {
    await prisma.signerProfile.create({
      data: {
        id: signer.id,
        jarvisUserId: signer.userId,
        nickname: signer.nickname,
        phone: signer.phone,
        avatarUrl: `/test-assets/model-card-${index + 1}.jpg`,
        gender: signer.gender,
        age: signer.age,
        birthDate: new Date(`${signer.birthDate}T00:00:00+08:00`),
        region: signer.region,
        heightCm: signer.height,
        weightKg: signer.weight,
        bustCm: signer.sizes[0],
        waistCm: signer.sizes[1],
        hipCm: signer.sizes[2],
        shoulderCm: signer.sizes[3],
        shoeSize: signer.shoe,
        clothingSize: signer.clothing,
        tattoo: signer.tattoo,
        hairColor: signer.hairColor,
        hairLength: signer.hairLength,
        languages: signer.languages,
        bio: signer.bio,
        imageUrls: [`/test-assets/model-card-${index + 1}.jpg`],
        videoUrls: index === 0 ? ["/test-assets/test-evidence.mp4"] : [],
        registeredAt: new Date(`2026-06-${String(index + 10).padStart(2, "0")}T10:00:00+08:00`),
        lastLoginAt: new Date("2026-07-13T20:00:00+08:00"),
        violationCount: index === 5 ? 1 : 0
      }
    });
  }
}

async function seedBrokers(batchId: string) {
  for (const broker of testBrokers) {
    await prisma.broker.create({
      data: {
        id: broker.id,
        miniProgramUserId: broker.userId,
        nickname: broker.nickname,
        wechatPhone: broker.phone,
        boundPhone: broker.phone,
        realNameStatus: "VERIFIED",
        accountStatus: "NORMAL",
        brokerLevel: broker.level,
        seedPhase: broker.phase,
        seedProgramJoinedAt: broker.joinedAt ? new Date(broker.joinedAt) : null,
        referralUnlocked: broker.unlocked,
        registeredAt: new Date("2026-05-01T10:00:00+08:00"),
        lastLoginAt: new Date("2026-07-14T08:30:00+08:00")
      }
    });
    if (broker.qualifiedAt) {
      await prisma.promotionRecord.create({
        data: {
          id: `promotion-${broker.id}`,
          brokerId: broker.id,
          fromLevel: "NORMAL",
          toLevel: "SEED",
          reason: broker.joinedAt === broker.qualifiedAt ? "测试首批种子手动赋予" : "测试满足 6 + 2 后运营晋升",
          promotedAt: new Date(broker.qualifiedAt),
          operator: "测试数据生成器"
        }
      });
    }
    await prisma.brokerSnapshot.create({
      data: { brokerId: broker.id, importBatchId: batchId, capturedAt: importedAt }
    });
  }
}

async function seedBriefings(batchId: string) {
  for (const [index, briefing] of testBriefings.entries()) {
    const workStartAt = new Date(`${briefing.workDate}T14:00:00+08:00`);
    const workEndAt = new Date(`${briefing.workDate}T20:00:00+08:00`);
    const signerIds = briefing.signers ?? [];
    await prisma.briefing.create({
      data: {
        id: briefing.id,
        jarvisBriefingId: `196000000000000${String(index + 1).padStart(3, "0")}`,
        brokerId: briefing.brokerId,
        title: briefing.title,
        recruitmentType: index % 2 === 0 ? "礼仪模特" : "执行人员",
        genderRequirement: index % 3 === 0 ? "不限" : "女",
        recruitCount: Math.max(1, signerIds.length),
        workAddress: index % 2 === 0 ? "上海市静安区测试会场" : "上海市徐汇区测试场地",
        workStartAt,
        workEndAt,
        publishedAt: new Date(briefing.publishedAt),
        finishedAt: briefing.sourceStatus === "进行中" ? null : workEndAt,
        salaryText: "礼仪 300 元/天；交通补贴 50 元",
        requirementText: detailText(briefing),
        sourceStatus: briefing.sourceStatus
      }
    });
    await prisma.briefingSnapshot.create({
      data: {
        briefingId: briefing.id,
        importBatchId: batchId,
        signupTimes: signerIds.length ? signerIds.length + 1 : index % 3,
        contractTimes: signerIds.length,
        signupPeople: signerIds.length ? signerIds.length + 1 : index % 3,
        contractPeople: signerIds.length,
        sourceStatus: briefing.sourceStatus,
        capturedAt: importedAt
      }
    });
    const reviewed = briefing.publishReview !== "PENDING" || briefing.completeReview !== "PENDING";
    const invalidReason = briefing.id === "test-briefing-22"
      ? "凭证异议：测试录屏内容待复核"
      : briefing.id === "test-briefing-25"
        ? "测试资料与本人不符\n[SIGNED_MODEL_MISMATCH:id%3A195000000000000005]"
        : briefing.cancelReason ?? null;
    await prisma.briefingReview.create({
      data: {
        briefingId: briefing.id,
        validPublishStatus: briefing.publishReview,
        validCompleteStatus: briefing.completeReview,
        invalidReason,
        reviewerName: reviewed ? "测试审核员" : null,
        reviewedAt: reviewed ? importedAt : null
      }
    });
    for (const signerId of signerIds) {
      await prisma.briefingSigner.create({
        data: { briefingId: briefing.id, signerId, signedAt: importedAt, sourceStatus: "已签约" }
      });
    }
    if (briefing.evidence) {
      await prisma.evidenceFile.create({
        data: {
          id: `evidence-${briefing.id}`,
          brokerId: briefing.brokerId,
          briefingId: briefing.id,
          fileName: "test-evidence.mp4",
          fileUrl: "/test-assets/test-evidence.mp4",
          fileType: "video/mp4",
          notes: "测试匹配凭证",
          matchedAt: importedAt,
          uploadedBy: "测试数据生成器",
          uploadedAt: importedAt
        }
      });
    }
  }
}

async function updateSummaries(batchId: string) {
  for (const broker of testBrokers) {
    const rows = testBriefings.filter((item) => item.brokerId === broker.id);
    const completed = rows.filter((item) => item.sourceStatus !== "进行中").length;
    const signupPeople = rows.reduce((total, item) => total + Math.max((item.signers ?? []).length + 1, 1), 0);
    const contractPeople = rows.reduce((total, item) => total + (item.signers ?? []).length, 0);
    await prisma.brokerSnapshot.update({
      where: { brokerId_importBatchId: { brokerId: broker.id, importBatchId: batchId } },
      data: {
        publishedBriefings: rows.length,
        completedBriefings: completed,
        signupTotalTimes: signupPeople,
        contractTotalTimes: contractPeople,
        signupTotalPeople: signupPeople,
        contractTotalPeople: contractPeople
      }
    });
  }
  for (const signer of testSigners) {
    const count = testBriefings.filter((item) => item.signers?.includes(signer.id)).length;
    await prisma.signerProfile.update({
      where: { id: signer.id },
      data: { acceptedBriefingCount: count, completedBriefingCount: count }
    });
  }
}

async function main() {
  await clearBusinessData();
  const batch = await prisma.importBatch.create({
    data: {
      id: "test-import-batch",
      title: "全流程测试数据库",
      source: "MANUAL",
      importedAt,
      operatorName: "测试数据生成器",
      brokerCount: testBrokers.length,
      briefingCount: testBriefings.length,
      notes: "覆盖身份晋升、上下线、审核、去重、跨周期、取消和结算前置条件"
    }
  });
  await seedSigners();
  await seedBrokers(batch.id);
  await seedBriefings(batch.id);
  await prisma.referralRelation.createMany({ data: [
    { id: "relation-root-ming", referrerId: "test-broker-root", refereeId: "test-broker-ming", bindPhone: "18800000002", boundAt: new Date("2026-07-01T10:00:00+08:00"), operator: "测试数据生成器", notes: "第一期种子引荐" },
    { id: "relation-root-hua", referrerId: "test-broker-root", refereeId: "test-broker-hua", bindPhone: "18800000003", boundAt: new Date("2026-06-20T09:00:00+08:00"), operator: "测试数据生成器", notes: "第一期种子引荐，已晋升" },
    { id: "relation-hua-zhou", referrerId: "test-broker-hua", refereeId: "test-broker-zhou", bindPhone: "18800000004", boundAt: new Date("2026-07-10T09:30:00+08:00"), operator: "测试数据生成器", notes: "第二层引荐链路" }
  ] });
  await updateSummaries(batch.id);
  console.log(`Seeded ${testBrokers.length} brokers, ${testBriefings.length} briefings, and ${testSigners.length} signers.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
