<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\Settings\ISettings;

class AdminSettings implements ISettings {

    public function __construct(
        private IConfig $config
    ) {}

    public function getForm(): TemplateResponse {
        $parameters = [
            'api_key' => $this->config->getAppValue('boudicaai', 'api_key', ''),
            'api_endpoint' => $this->config->getAppValue('boudicaai', 'api_endpoint', 'https://boudi.ca/api/boudica/chat'),
            'user_id' => $this->config->getAppValue('boudicaai', 'user_id', ''),
        ];
        return new TemplateResponse('boudicaai', 'admin', $parameters, '');
    }

    public function getSection(): string {
        return 'boudicaai'; // must match the section ID registered below
    }

    public function getPriority(): int {
        return 50;
    }
}