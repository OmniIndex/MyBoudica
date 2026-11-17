<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\DataResponse;
use OCP\IAppConfig;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

/**
 * Boudica Mail "Mail users" page (2026-11-17, boudica_slm
 * product_templates/mail/PLAN.md "Phase 5a"): when a Boudica admin adds a
 * mailbox with "Add to Nextcloud Mail", Boudica's engine calls this to create
 * the person's Nextcloud Mail account.
 *
 *   POST /apps/boudicaai/api/mail/provision
 *   X-Boudica-Provision-Token: <app config mail_provision_token>
 *   {"nc_user": uid or email, "address", "display_name", "password", "mail_host"}
 *
 * BOUDICA ONLY: the token (app config mail_provision_token, sensitive; the
 * same value is Boudica's BOUDICA_NC_PROVISION_TOKEN), a private address, and
 * no X-Forwarded-For (so never through the public proxy). Off while the token
 * is unset. The password is a mailbox app password made for this account
 * only; Nextcloud Mail stores it encrypted and tests the IMAP and SMTP sign-in
 * before saving. An existing account for the same address is left as it is.
 */
class MailProvisionController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private IAppConfig $appConfig,
        private IUserManager $userManager,
        private LoggerInterface $logger,
    ) {
        parent::__construct($appName, $request);
    }

    private static function privateAddress(string $ip): bool {
        return filter_var($ip, FILTER_VALIDATE_IP) !== false
            && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }

    private function findUser(string $who): ?IUser {
        $u = $this->userManager->get($who);
        if ($u !== null) {
            return $u;
        }
        $found = $this->userManager->getByEmail($who);
        return count($found) === 1 ? $found[0] : null;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'POST', url: '/api/mail/provision')]
    public function provision(): DataResponse {
        $token = $this->appConfig->getValueString('boudicaai', 'mail_provision_token', '');
        $given = (string)$this->request->getHeader('X-Boudica-Provision-Token');
        $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
        if (strlen($token) < 32 || !hash_equals($token, $given)) {
            $this->logger->warning('Boudica mail provisioning refused: wrong or missing token from ' . $remote);
            return new DataResponse(['ok' => false, 'error' => 'refused'], 403);
        }
        if (!self::privateAddress($remote) || !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $this->logger->warning('Boudica mail provisioning refused: not a direct internal call (' . $remote . ')');
            return new DataResponse(['ok' => false, 'error' => 'internal only'], 403);
        }
        $ncUser = trim((string)$this->request->getParam('nc_user', ''));
        $address = strtolower(trim((string)$this->request->getParam('address', '')));
        $name = trim((string)$this->request->getParam('display_name', ''));
        $password = (string)$this->request->getParam('password', '');
        $host = strtolower(trim((string)$this->request->getParam('mail_host', '')));
        if (!filter_var($address, FILTER_VALIDATE_EMAIL) || $password === ''
            || !preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $host)) {
            return new DataResponse(['ok' => false, 'error' => 'bad request'], 400);
        }
        $user = $this->findUser($ncUser !== '' ? $ncUser : $address);
        if ($user === null) {
            return new DataResponse(['ok' => false, 'error' => 'No Nextcloud user ' . ($ncUser !== '' ? $ncUser : $address)
                . ' (give the person\'s Nextcloud user name or email)'], 404);
        }
        try {
            /** @var \OCA\Mail\Service\AccountService $accounts */
            $accounts = \OCP\Server::get('OCA\Mail\Service\AccountService');
            /** @var \OCA\Mail\Service\SetupService $setup */
            $setup = \OCP\Server::get('OCA\Mail\Service\SetupService');
        } catch (\Throwable $e) {
            return new DataResponse(['ok' => false, 'error' => 'Nextcloud Mail is not installed'], 409);
        }
        $result = ['ok' => true, 'nc_uid' => $user->getUID(), 'nc_email' => strtolower((string)$user->getEMailAddress())];
        foreach ($accounts->findByUserId($user->getUID()) as $acc) {
            if (strtolower($acc->getEmail()) === $address) {
                $result['existing'] = true;
                return new DataResponse($result);
            }
        }
        try {
            $acc = $setup->createNewAccount($name !== '' ? $name : $address, $address,
                $host, 993, 'ssl', $address, $password,
                $host, 465, 'ssl', $address, $password,
                $user->getUID(), 'password');
            $result['account_id'] = $acc->getId();
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica mail provisioning for ' . $address . ' failed: ' . $e->getMessage());
            return new DataResponse(['ok' => false, 'error' => 'Nextcloud Mail could not sign in to ' . $host . ': '
                . substr($e->getMessage(), 0, 200)], 502);
        }
        $this->logger->info('Boudica mail provisioning: Nextcloud Mail account for ' . $address . ' added to ' . $user->getUID());
        return new DataResponse($result);
    }
}
