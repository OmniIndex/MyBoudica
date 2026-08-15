<?php

namespace OCA\BoudicaCode\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\IRequest;

/**
 * Serves files from js/vendor/monaco/vs/** directly, bypassing
 * Nextcloud's built-in app-asset routing. That routing appears to have
 * a nesting-depth limit that Monaco's own directory structure exceeds
 * (editor/editor.main.js, base/worker/workerMain.js, language chunk
 * files, etc. all sit several levels deep). This controller just reads
 * the file off disk and streams it back with the right Content-Type,
 * which is all Monaco's AMD loader needs.
 */
class MonacoAssetsController extends Controller {

    private const MIME_TYPES = [
        'js' => 'application/javascript',
        'css' => 'text/css',
        'json' => 'application/json',
        'ttf' => 'font/ttf',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'map' => 'application/json',
        'svg' => 'image/svg+xml',
    ];

    public function __construct(string $appName, IRequest $request) {
        parent::__construct($appName, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function serve(string $path) {
        // Guard against path traversal — only allow the characters
        // Monaco's own filenames actually use.
        if (str_contains($path, '..') || !preg_match('#^[A-Za-z0-9/_.\-]+$#', $path)) {
            return new NotFoundResponse();
        }

        $baseDir = realpath(__DIR__ . '/../../js/vendor/monaco/vs');
        $fullPath = realpath($baseDir . '/' . $path);

        // Make sure the resolved path is still inside the vendor dir
        // (realpath resolves symlinks/.. so this catches anything the
        // regex above might have missed).
        if ($fullPath === false || $baseDir === false || !str_starts_with($fullPath, $baseDir)) {
            return new NotFoundResponse();
        }

        if (!is_file($fullPath)) {
            return new NotFoundResponse();
        }

        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        $mime = self::MIME_TYPES[$ext] ?? 'application/octet-stream';

        $content = file_get_contents($fullPath);
        $response = new DataDisplayResponse($content, 200, ['Content-Type' => $mime]);
        // These files are content-hashed by Monaco's build, so they're
        // safe to cache aggressively.
        $response->cacheFor(60 * 60 * 24 * 30);
        return $response;
    }
}
