ALTER TABLE `Broker`
  ADD COLUMN `identityReviewStatus` ENUM('NONE', 'PENDING', 'RETAINED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN `identityReviewValidPublishCount` INTEGER NULL,
  ADD COLUMN `identityReviewValidCompleteCount` INTEGER NULL,
  ADD COLUMN `identityReviewTriggeredAt` DATETIME(3) NULL,
  ADD COLUMN `identityReviewResolvedAt` DATETIME(3) NULL;
