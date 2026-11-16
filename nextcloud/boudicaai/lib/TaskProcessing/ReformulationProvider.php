<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\TaskProcessing;

use OCP\TaskProcessing\TaskTypes\TextToTextReformulation;

/** Boudica for Nextcloud's TextToTextReformulation tasks (see BoudicaTextProvider). */
class ReformulationProvider extends BoudicaTextProvider {
    public function getTaskTypeId(): string {
        return TextToTextReformulation::ID;
    }
}
