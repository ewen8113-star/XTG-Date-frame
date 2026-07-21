ALTER TABLE `BriefingSigner`
  ADD COLUMN `sourceRecordId` VARCHAR(191) NULL,
  ADD COLUMN `signedUpAt` DATETIME(3) NULL,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL,
  ADD COLUMN `cancelReason` TEXT NULL,
  ADD COLUMN `sourceUpdatedAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD UNIQUE INDEX `BriefingSigner_sourceRecordId_key`(`sourceRecordId`);

CREATE TABLE `OperationLog` (
  `id` VARCHAR(191) NOT NULL,
  `actor` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `module` VARCHAR(191) NOT NULL,
  `method` VARCHAR(191) NULL,
  `path` VARCHAR(191) NULL,
  `result` VARCHAR(191) NOT NULL,
  `detail` TEXT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OperationLog_createdAt_idx`(`createdAt`),
  INDEX `OperationLog_actor_createdAt_idx`(`actor`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DataSyncRun` (
  `id` VARCHAR(191) NOT NULL,
  `triggerType` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `brokerCount` INTEGER NOT NULL DEFAULT 0,
  `briefingCount` INTEGER NOT NULL DEFAULT 0,
  `participantCount` INTEGER NOT NULL DEFAULT 0,
  `modelCount` INTEGER NOT NULL DEFAULT 0,
  `changedCount` INTEGER NOT NULL DEFAULT 0,
  `message` TEXT NULL,
  INDEX `DataSyncRun_startedAt_idx`(`startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
