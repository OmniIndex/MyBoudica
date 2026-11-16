<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\TaskProcessing;

use OCP\TaskProcessing\TaskTypes\TextToTextSummary;

/** Boudica for Nextcloud's TextToTextSummary tasks (see BoudicaTextProvider). */
class SummaryProvider extends BoudicaTextProvider {
    public function getTaskTypeId(): string {
        return TextToTextSummary::ID;
    }
}
