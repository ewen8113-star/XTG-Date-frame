CREATE TABLE `SignerProfile` (
  `id` VARCHAR(191) NOT NULL,
  `jarvisUserId` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `avatarUrl` VARCHAR(191) NULL,
  `userType` VARCHAR(191) NOT NULL DEFAULT '模特',
  `accountStatus` VARCHAR(191) NOT NULL DEFAULT '正常',
  `gender` VARCHAR(191) NULL,
  `age` INTEGER NULL,
  `birthDate` DATETIME(3) NULL,
  `region` VARCHAR(191) NULL,
  `heightCm` INTEGER NULL,
  `weightKg` INTEGER NULL,
  `bustCm` INTEGER NULL,
  `waistCm` INTEGER NULL,
  `hipCm` INTEGER NULL,
  `shoulderCm` INTEGER NULL,
  `shoeSize` VARCHAR(191) NULL,
  `clothingSize` VARCHAR(191) NULL,
  `tattoo` VARCHAR(191) NULL,
  `hairColor` VARCHAR(191) NULL,
  `hairLength` VARCHAR(191) NULL,
  `languages` VARCHAR(191) NULL,
  `bio` TEXT NULL,
  `imageUrls` JSON NULL,
  `videoUrls` JSON NULL,
  `registeredAt` DATETIME(3) NULL,
  `lastLoginAt` DATETIME(3) NULL,
  `violationCount` INTEGER NOT NULL DEFAULT 0,
  `acceptedBriefingCount` INTEGER NOT NULL DEFAULT 0,
  `completedBriefingCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SignerProfile_jarvisUserId_key`(`jarvisUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BriefingSigner` (
  `id` VARCHAR(191) NOT NULL,
  `briefingId` VARCHAR(191) NOT NULL,
  `signerId` VARCHAR(191) NOT NULL,
  `signedAt` DATETIME(3) NULL,
  `sourceStatus` VARCHAR(191) NOT NULL DEFAULT '已签约',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `BriefingSigner_signerId_idx`(`signerId`),
  UNIQUE INDEX `BriefingSigner_briefingId_signerId_key`(`briefingId`, `signerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BriefingSigner`
  ADD CONSTRAINT `BriefingSigner_briefingId_fkey`
  FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `BriefingSigner`
  ADD CONSTRAINT `BriefingSigner_signerId_fkey`
  FOREIGN KEY (`signerId`) REFERENCES `SignerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
