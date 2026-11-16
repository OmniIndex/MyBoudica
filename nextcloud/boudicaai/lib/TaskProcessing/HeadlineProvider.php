<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\TaskProcessing;

use OCP\TaskProcessing\TaskTypes\TextToTextHeadline;

/** Boudica for Nextcloud's TextToTextHeadline tasks (see BoudicaTextProvider). */
class HeadlineProvider extends BoudicaTextProvider {
    public function getTaskTypeId(): string {
        return TextToTextHeadline::ID;
    }
}
