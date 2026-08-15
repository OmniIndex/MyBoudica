<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\BackgroundJob;

use OCA\BoudicaAi\Service\DigestService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/**
 * Polls every user with at least one Talk room membership and runs
 * DigestService's quiet/active state machine for each of their rooms.
 *
 * Interval is 5 minutes — Nextcloud's own system cron conventionally
 * runs every 5 minutes too, so that's the practical floor for how
 * fresh this can be regardless of what's set here; setting anything
 * shorter wouldn't actually poll more often unless the system cron
 * entry itself is also tightened.
 */
class DigestPollJob extends TimedJob {

    public function __construct(
        ITimeFactory $time,
        private DigestService $digestService,
        private LoggerInterface $logger,
    ) {
        parent::__construct($time);
        $this->setInterval(5 * 60);
    }

    protected function run($argument): void {
        $userIds = $this->digestService->getActiveTalkUserIds();
        foreach ($userIds as $userId) {
            try {
                $this->digestService->pollUser($userId);
            } catch (\Throwable $e) {
                $this->logger->error("Boudica digest: poll failed for user {$userId}: " . $e->getMessage());
            }
        }
    }
}
