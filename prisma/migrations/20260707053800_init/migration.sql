-- CreateTable
CREATE TABLE `Broker` (
    `id` VARCHAR(191) NOT NULL,
    `miniProgramUserId` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NOT NULL,
    `wechatPhone` VARCHAR(191) NULL,
    `boundPhone` VARCHAR(191) NULL,
    `realNameStatus` ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'UNVERIFIED',
    `accountStatus` ENUM('NORMAL', 'LIMITED', 'TEMP_BANNED', 'PERM_BANNED') NOT NULL DEFAULT 'NORMAL',
    `brokerLevel` ENUM('NORMAL', 'SEED') NOT NULL DEFAULT 'NORMAL',
    `referralUnlocked` BOOLEAN NOT NULL DEFAULT false,
    `registeredAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `violationCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Broker_miniProgramUserId_key`(`miniProgramUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportBatch` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `source` ENUM('JARVIS_CHROME', 'MANUAL', 'EXCEL') NOT NULL DEFAULT 'JARVIS_CHROME',
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `operatorName` VARCHAR(191) NOT NULL DEFAULT '开发预览账号',
    `brokerCount` INTEGER NOT NULL DEFAULT 0,
    `briefingCount` INTEGER NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrokerSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `brokerId` VARCHAR(191) NOT NULL,
    `importBatchId` VARCHAR(191) NOT NULL,
    `publishedBriefings` INTEGER NOT NULL DEFAULT 0,
    `completedBriefings` INTEGER NOT NULL DEFAULT 0,
    `signupTotalTimes` INTEGER NOT NULL DEFAULT 0,
    `contractTotalTimes` INTEGER NOT NULL DEFAULT 0,
    `signupTotalPeople` INTEGER NOT NULL DEFAULT 0,
    `contractTotalPeople` INTEGER NOT NULL DEFAULT 0,
    `violationCount` INTEGER NOT NULL DEFAULT 0,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BrokerSnapshot_brokerId_importBatchId_key`(`brokerId`, `importBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Briefing` (
    `id` VARCHAR(191) NOT NULL,
    `jarvisBriefingId` VARCHAR(191) NOT NULL,
    `brokerId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `recruitmentType` VARCHAR(191) NULL,
    `genderRequirement` VARCHAR(191) NULL,
    `recruitCount` INTEGER NULL,
    `workAddress` VARCHAR(191) NULL,
    `workStartAt` DATETIME(3) NULL,
    `workEndAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `salaryText` VARCHAR(191) NULL,
    `requirementText` TEXT NULL,
    `sourceStatus` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Briefing_jarvisBriefingId_key`(`jarvisBriefingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BriefingSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `briefingId` VARCHAR(191) NOT NULL,
    `importBatchId` VARCHAR(191) NOT NULL,
    `signupTimes` INTEGER NOT NULL DEFAULT 0,
    `contractTimes` INTEGER NOT NULL DEFAULT 0,
    `signupPeople` INTEGER NOT NULL DEFAULT 0,
    `contractPeople` INTEGER NOT NULL DEFAULT 0,
    `sourceStatus` VARCHAR(191) NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BriefingSnapshot_briefingId_importBatchId_key`(`briefingId`, `importBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BriefingReview` (
    `id` VARCHAR(191) NOT NULL,
    `briefingId` VARCHAR(191) NOT NULL,
    `validPublishStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `validCompleteStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `invalidReason` VARCHAR(191) NULL,
    `reviewerName` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `isSameProjectLimited` BOOLEAN NOT NULL DEFAULT false,
    `isDailyLimitExceeded` BOOLEAN NOT NULL DEFAULT false,
    `isWeeklyLimitExceeded` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BriefingReview_briefingId_key`(`briefingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceFile` (
    `id` VARCHAR(191) NOT NULL,
    `briefingId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `uploadedBy` VARCHAR(191) NOT NULL DEFAULT '开发预览账号',
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralRelation` (
    `id` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `bindPhone` VARCHAR(191) NULL,
    `boundAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `operator` VARCHAR(191) NOT NULL DEFAULT '开发预览账号',
    `notes` VARCHAR(191) NULL,

    UNIQUE INDEX `ReferralRelation_referrerId_refereeId_key`(`referrerId`, `refereeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PromotionRecord` (
    `id` VARCHAR(191) NOT NULL,
    `brokerId` VARCHAR(191) NOT NULL,
    `fromLevel` ENUM('NORMAL', 'SEED') NOT NULL,
    `toLevel` ENUM('NORMAL', 'SEED') NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `promotedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `operator` VARCHAR(191) NOT NULL DEFAULT '开发预览账号',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SettlementCycle` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `weekEnd` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'PREVIEW_SENT', 'DISPUTE_REVIEW', 'FINANCE_SUBMITTED', 'PAID', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SettlementItem` (
    `id` VARCHAR(191) NOT NULL,
    `settlementCycleId` VARCHAR(191) NOT NULL,
    `brokerId` VARCHAR(191) NOT NULL,
    `briefingId` VARCHAR(191) NULL,
    `itemType` ENUM('VALID_PUBLISH', 'VALID_COMPLETE', 'REFERRAL_BASE', 'REFERRAL_INCREMENT') NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitAmountCents` INTEGER NOT NULL,
    `totalAmountCents` INTEGER NOT NULL,
    `status` ENUM('PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'ADJUSTED', 'PAID') NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BrokerSnapshot` ADD CONSTRAINT `BrokerSnapshot_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BrokerSnapshot` ADD CONSTRAINT `BrokerSnapshot_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `ImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Briefing` ADD CONSTRAINT `Briefing_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingSnapshot` ADD CONSTRAINT `BriefingSnapshot_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingSnapshot` ADD CONSTRAINT `BriefingSnapshot_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `ImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingReview` ADD CONSTRAINT `BriefingReview_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionRecord` ADD CONSTRAINT `PromotionRecord_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettlementItem` ADD CONSTRAINT `SettlementItem_settlementCycleId_fkey` FOREIGN KEY (`settlementCycleId`) REFERENCES `SettlementCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettlementItem` ADD CONSTRAINT `SettlementItem_brokerId_fkey` FOREIGN KEY (`brokerId`) REFERENCES `Broker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettlementItem` ADD CONSTRAINT `SettlementItem_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
