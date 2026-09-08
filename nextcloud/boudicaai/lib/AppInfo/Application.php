<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\AppInfo;

use OCA\BoudicaAi\Command\TranscribeCallsCommand;
use OCA\BoudicaAi\Command\JanusTranscriptionCommand;
use OCA\BoudicaAi\Listener\TalkBotInvokeListener;
use OCA\BoudicaAi\Listener\CallRecordingListener;
use OCA\BoudicaAi\Listener\LogoutRedirectListener;
use OCA\BoudicaAi\Login\BoudicaKeycloakLogin;
use OCA\Talk\Events\BotInvokeEvent;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;

class Application extends App implements IBootstrap {
    public const APP_ID = 'boudicaai';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    // public function register(IRegistrationContext $context): void {
    //     $context->registerEventListener(BotInvokeEvent::class, TalkBotInvokeListener::class);
        
    //     // Register call recording listener for transcript processing
    //     try {
    //         if (class_exists('OCA\Talk\Events\RecordingStartedEvent')) {
    //             $context->registerEventListener(\OCA\Talk\Events\RecordingStartedEvent::class, CallRecordingListener::class);
    //         }
    //     } catch (\Throwable $e) {
    //         // Event class may not exist in this Talk version
    //     }
    // }

    public function register(IRegistrationContext $context): void {
        $context->registerEventListener(BotInvokeEvent::class, TalkBotInvokeListener::class);
        $context->registerEventListener(\OCA\Talk\Events\CallStartedEvent::class, CallRecordingListener::class);
        $context->registerEventListener(\OCA\Talk\Events\CallEndedEvent::class, CallRecordingListener::class);

        // "Sign in with Boudica" button on Nextcloud's own login page -
        // registerAlternativeLoginProvider() would be the non-deprecated
        // choice but needs NC 34+; this app's info.xml declares
        // min-version 31, so this deprecated-but-still-functional call is
        // used instead for broader compatibility.
        $context->registerAlternativeLogin(BoudicaKeycloakLogin::class);

        // Fixes "logging out logs me straight back in" - see
        // LogoutRedirectListener's own docblock for the full root cause.
        // Fires on every authenticated page (not just login), so the
        // logout-link interceptor it loads works wherever "Log out" is
        // clicked from.
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, LogoutRedirectListener::class);
    }

    public function boot(IBootContext $context): void {
        // CSP registration removed — OCP\Security\CSP\ContentSecurityPolicyManager
        // is not resolvable on this Nextcloud version. Re-add later via the
        // proxy-through-app approach instead of a direct CSP policy if needed.
    }
}