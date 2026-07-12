ALTER TABLE `EvidenceFile` ADD COLUMN `brokerId` VARCHAR(191) NULL;
ALTER TABLE `EvidenceFile` ADD COLUMN `matchedAt` DATETIME(3) NULL;

UPDATE `EvidenceFile` ef
JOIN `Briefing` b ON b.`id` = ef.`briefingId`
SET ef.`brokerId` = b.`brokerId`,
    ef.`matchedAt` = ef.`uploadedAt`
WHERE ef.`brokerId` IS NULL;

ALTER TABLE `EvidenceFile` MODIFY `brokerId` VARCHAR(191) NOT NULL;
ALTER TABLE `EvidenceFile` MODIFY `briefingId` VARCHAR(191) NULL;

ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
