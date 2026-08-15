<?php
namespace OCA\BoudicaAi\AppInfo;

use OCA\BoudicaAi\Listener\TalkBotInvokeListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
    public const APP_ID = 'boudicaai';

    public function __construct() {
        parent::__construct(self::APP_ID); 
    }

    public function register(IRegistrationContext $context): void {
        if (class_exists(\OCA\Talk\Events\BotInvokeEvent::class)) {
            $context->registerEventListener(
                \OCA\Talk\Events\BotInvokeEvent::class,
                TalkBotInvokeListener::class
            );
        }
        // DigestPollJob is registered declaratively via appinfo/info.xml's
        // <background-jobs> block instead of here — that's the mechanism
        // Nextcloud's own docs confirm runs on install/update; keeping only
        // one registration path avoids two possibly-duplicate job rows.
    }

    public function boot(IBootContext $context): void {
        $container = $context->getAppContainer();
        
        // Load services.php to register all service dependencies
        require_once __DIR__ . '/services.php';
    }
}