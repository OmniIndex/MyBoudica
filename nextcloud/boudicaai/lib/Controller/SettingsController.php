<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class SettingsController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * @NoAdminRequired
     * Actually — you likely WANT admin-required here. See note below.
     */
    public function save(string $api_key, string $api_endpoint, string $user_id): JSONResponse {
        $this->config->setAppValue('boudicaai', 'api_key', $api_key);
        $this->config->setAppValue('boudicaai', 'api_endpoint', $api_endpoint);
        $this->config->setAppValue('boudicaai', 'user_id', $user_id);
        return new JSONResponse(['status' => 'ok']);
    }
}