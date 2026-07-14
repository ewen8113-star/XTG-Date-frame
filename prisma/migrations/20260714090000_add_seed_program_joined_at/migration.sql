ALTER TABLE `Broker`
  ADD COLUMN `seedProgramJoinedAt` DATETIME(3) NULL;

UPDATE `Broker` AS broker
SET broker.`seedProgramJoinedAt` = COALESCE(
  (
    SELECT MAX(promotion.`promotedAt`)
    FROM `PromotionRecord` AS promotion
    WHERE promotion.`brokerId` = broker.`id`
      AND promotion.`toLevel` = 'SEED'
  ),
  broker.`createdAt`
)
WHERE broker.`brokerLevel` = 'SEED'
  AND broker.`seedProgramJoinedAt` IS NULL;
