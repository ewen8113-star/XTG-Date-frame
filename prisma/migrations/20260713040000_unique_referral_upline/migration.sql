-- Each broker can have only one direct referrer, while remaining free to refer others.
CREATE UNIQUE INDEX `ReferralRelation_refereeId_key` ON `ReferralRelation`(`refereeId`);
