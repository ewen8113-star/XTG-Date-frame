import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.settlementItem.deleteMany(),
    prisma.settlementCycle.deleteMany(),
    prisma.evidenceFile.deleteMany(),
    prisma.briefingReview.deleteMany(),
    prisma.briefingSnapshot.deleteMany(),
    prisma.briefing.deleteMany(),
    prisma.brokerSnapshot.deleteMany(),
    prisma.referralRelation.deleteMany(),
    prisma.promotionRecord.deleteMany(),
    prisma.broker.deleteMany(),
    prisma.importBatch.deleteMany()
  ]);

  console.log("Cleared preview data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
