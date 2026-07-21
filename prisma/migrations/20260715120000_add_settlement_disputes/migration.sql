CREATE TABLE `SettlementDispute` (
  `id` VARCHAR(191) NOT NULL,
  `briefingId` VARCHAR(191) NOT NULL,
  `originalCycleKey` VARCHAR(191) NOT NULL,
  `deferredCycleKey` VARCHAR(191) NULL,
  `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `reason` TEXT NULL,
  `resolution` TEXT NULL,
  `submittedBy` VARCHAR(191) NOT NULL DEFAULT '开发预览账号',
  `reviewedBy` VARCHAR(191) NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SettlementDispute_briefingId_key`(`briefingId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SettlementDispute`
  ADD CONSTRAINT `SettlementDispute_briefingId_fkey`
  FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
