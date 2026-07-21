ALTER TABLE `SettlementDispute`
  ADD COLUMN `deferPublishReward` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `deferCompleteReward` BOOLEAN NOT NULL DEFAULT false;

UPDATE `SettlementDispute` dispute
JOIN `BriefingReview` review ON review.`briefingId` = dispute.`briefingId`
SET
  dispute.`deferPublishReward` = review.`validPublishStatus` = 'REJECTED',
  dispute.`deferCompleteReward` = review.`validCompleteStatus` = 'REJECTED'
WHERE dispute.`status` = 'PENDING_REVIEW';

UPDATE `SettlementDispute` dispute
JOIN `BriefingReview` review ON review.`briefingId` = dispute.`briefingId`
SET dispute.`deferCompleteReward` = true
WHERE dispute.`status` = 'APPROVED'
  AND review.`validCompleteStatus` = 'APPROVED'
  AND EXISTS (SELECT 1 FROM `BriefingSigner` signer WHERE signer.`briefingId` = dispute.`briefingId`);
