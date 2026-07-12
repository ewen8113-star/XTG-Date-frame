-- DropForeignKey
ALTER TABLE `EvidenceFile` DROP FOREIGN KEY `EvidenceFile_briefingId_fkey`;

-- DropIndex
DROP INDEX `EvidenceFile_briefingId_fkey` ON `EvidenceFile`;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
