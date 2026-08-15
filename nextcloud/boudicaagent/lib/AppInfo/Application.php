<?php

namespace OCA\BoudicaAgent\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {

    public const APP_ID = 'boudicaagent';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void {
        // No custom services to register yet — PageController is
        // resolved automatically via constructor injection.
    }

    public function boot(IBootContext $context): void {
        // Nothing needed at boot time yet.
    }
}
