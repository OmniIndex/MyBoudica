<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use GuzzleHttp\Client;
use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * Mints (or reuses) a Boudica API key for a Nextcloud user, via the same
 * anonymous /beta/signup endpoint boudica-autosignup.js was always meant to
 * call - moved server-side and now correctly gated behind
 * KeycloakLoginController's provision_check call, instead of firing
 * unconditionally for every Nextcloud user regardless of domain status.
 *
 * Used for BOTH provision_check outcomes that result in a completed
 * Nextcloud login (domain "allowed"/"new_user" and "domain_not_found"):
 * seat/domain accounting already happened in boudislm.valid_domains via
 * provision_user() by the time this runs, so this step only has to answer
 * "does this Nextcloud user have a working credential for the embedded
 * boudicaagent/boudicacode/boudicadashboard apps yet" - it does not need to
 * know which provisioning path got them here.
 *
 * Uses a raw GuzzleHttp\Client rather than OCP\Http\Client\IClientService -
 * confirmed live (see KeycloakLoginController's own class docblock):
 * IClientService's SSRF guard rejects any request to a Docker-internal
 * service name with "violates local access rules". Same pattern
 * TranscriptionService.php already uses for its own internal whisper call.
 */
class KeycloakProvisioningService {
    // Internal Docker-network address - boudica_slm's own `web` service on
    // the shared `boudica_shared` network, same convention already used by
    // nginx's proxy_pass entries and by boudica-multiuser.conf's own
    // internal Keycloak URL for provision_check. Not deployment-configurable
    // on purpose: this is a fixed container-to-container hop, not something
    // that varies per install the way the public-facing endpoint does.
    private const BETA_SIGNUP_URL = 'http://web:80/api/boudica/beta/signup';

    private Client $httpClient;

    public function __construct(
        private IConfig $config,
        private LoggerInterface $logger,
    ) {
        $this->httpClient = new Client(['timeout' => 15]);
    }

    /**
     * @return string|null the API key now on file for this user, or null if
     *                      minting one failed (logged, not thrown - a
     *                      failure here should not block the Nextcloud
     *                      login itself; the user can still set a key
     *                      manually via Settings).
     */
    public function ensureApiKey(string $uid, string $name): ?string {
        $existing = $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '');
        if ($existing !== '') {
            return $existing;
        }

        try {
            $response = $this->httpClient->post(self::BETA_SIGNUP_URL, [
                'json' => [
                    'name' => $name !== '' ? $name : $uid,
                    'email' => $uid,
                ],
            ]);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica beta/signup call failed for Keycloak-provisioned user', [
                'app' => 'boudicaai',
                'uid' => $uid,
                'exception' => $e,
            ]);
            return null;
        }

        $data = json_decode((string) $response->getBody(), true);
        $apiKey = is_array($data) ? ($data['api_key'] ?? null) : null;
        if (!is_string($apiKey) || $apiKey === '') {
            $this->logger->warning('Boudica beta/signup returned no api_key', [
                'app' => 'boudicaai',
                'uid' => $uid,
                'response' => $data,
            ]);
            return null;
        }

        $this->config->setUserValue($uid, 'boudicaai', 'boudica_api_key', $apiKey);
        $this->config->setUserValue($uid, 'boudicaai', 'boudica_email', $uid);

        return $apiKey;
    }
}
