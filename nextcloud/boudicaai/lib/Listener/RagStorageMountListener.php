<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Listener;

use OCA\Files_External\Service\GlobalStoragesService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\User\Events\UserFirstTimeLoggedInEvent;
use Psr\Log\LoggerInterface;

/**
 * Mounts each user's own slice of the shared multiuser RAG corpus
 * (/mnt/boudica_corpus/users/<uid>/public - see product_templates/
 * multiuser's docker-compose.yml, BOUDICA_MULTIUSER_CORPUS_DIR) as personal
 * external storage the first time they ever log in.
 *
 * Previously this was only ever set up once, by hand, for a single test
 * account (a one-off `occ files_external:create`) - never wired to run for
 * anyone else. inference_server.cpp's domain_routing match_on:"user_id"
 * rule already routes each user's own RAG queries to this same
 * users/<uid>/public/ path, and rag-watcher already watches it recursively
 * - this listener is the missing piece that lets a user actually SEE that
 * folder inside their own Nextcloud account, not just have the backend
 * already treating it as theirs.
 */
class RagStorageMountListener implements IEventListener {
    private const MOUNT_POINT = 'Boudica AI Knowledge Base';
    private const CORPUS_USERS_ROOT = '/mnt/boudica_corpus/users';

    public function __construct(
        private GlobalStoragesService $storagesService,
        private LoggerInterface $logger,
    ) {
    }

    public function handle(Event $event): void {
        if (!($event instanceof UserFirstTimeLoggedInEvent)) {
            return;
        }

        $uid = $event->getUser()->getUID();

        // Idempotent: a UID that somehow fires this event twice (e.g.
        // deleted and re-provisioned) must not end up with duplicate
        // mounts stacking up in their Files sidebar.
        foreach ($this->storagesService->getAllStorages() as $existing) {
            if ($existing->getMountPoint() === self::MOUNT_POINT
                && in_array($uid, $existing->getApplicableUsers(), true)) {
                return;
            }
        }

        try {
            $storage = $this->storagesService->createStorage(
                self::MOUNT_POINT,
                'local',
                'null::null',
                ['datadir' => self::CORPUS_USERS_ROOT . '/' . $uid . '/public'],
                ['enable_sharing' => false],
                [$uid],
                null,
            );
            $this->storagesService->addStorage($storage);
        } catch (\Throwable $e) {
            // Never block login over this - a missing/failed mount is
            // recoverable later, a blocked login is not.
            $this->logger->error(
                'RagStorageMountListener: failed to mount RAG knowledge base for ' . $uid . ': ' . $e->getMessage(),
                ['app' => 'boudicaai']
            );
        }
    }
}
