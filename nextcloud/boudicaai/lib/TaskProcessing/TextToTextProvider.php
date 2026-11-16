<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\TaskProcessing;

use OCP\TaskProcessing\TaskTypes\TextToText;

/** Boudica for Nextcloud's TextToText tasks (see BoudicaTextProvider). */
class TextToTextProvider extends BoudicaTextProvider {
    public function getTaskTypeId(): string {
        return TextToText::ID;
    }
}
