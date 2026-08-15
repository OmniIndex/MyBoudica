<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Settings;

use OCP\IURLGenerator;
use OCP\IL10N;
use OCP\Settings\IIconSection;

class AdminSection implements IIconSection {

    public function __construct(
        private IURLGenerator $urlGenerator,
        private IL10N $l
    ) {}

    public function getID(): string {
        return 'boudicaai';
    }

    public function getName(): string {
        return $this->l->t('Boudica AI');
    }

    public function getPriority(): int {
        return 50;
    }

    public function getIcon(): string {
        return $this->urlGenerator->imagePath('boudicaai', 'app.svg');
    }
}