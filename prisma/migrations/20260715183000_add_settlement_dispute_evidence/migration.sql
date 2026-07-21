CREATE TABLE `SettlementDisputeEvidence` (
  `id` VARCHAR(191) NOT NULL,
  `disputeId` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `fileUrl` VARCHAR(191) NOT NULL,
  `fileType` VARCHAR(191) NULL,
  `uploadedBy` VARCHAR(191) NOT NULL DEFAULT '开发预览账号',
  `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SettlementDisputeEvidence_disputeId_idx` (`disputeId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SettlementDisputeEvidence_disputeId_fkey` FOREIGN KEY (`disputeId`) REFERENCES `SettlementDispute`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
