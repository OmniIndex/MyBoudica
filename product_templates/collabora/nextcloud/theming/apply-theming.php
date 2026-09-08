<?php
/**
 * Applies the default "My Boudica" theme (pulled from the live eu1.myboudica.com
 * install's theming app config/images, 2026-09-04) to a fresh Nextcloud
 * install. Run once from setup.sh's post-install step, as www-data, via
 * `php /opt/boudica-theming/apply-theming.php`.
 *
 * Bootstraps Nextcloud the same way occ/index.php do, then calls the exact
 * same internal ImageManager::updateImage() + ThemingDefaults::set() pair
 * ThemingController::uploadImage() uses for a real admin-panel image
 * upload - same validation/optimization/cachebuster behavior as a browser
 * upload, without needing an HTTP/session/CSRF-driven login to get there.
 * The text values (name/slogan/url/...) are set separately by setup.sh via
 * the existing `occ theming:config` command, which already covers them.
 */
require_once '/var/www/html/lib/base.php';

$imageManager = \OC::$server->get(\OCA\Theming\ImageManager::class);
$themingDefaults = \OC::$server->get(\OCA\Theming\ThemingDefaults::class);

$images = [
    'logo' => '/opt/boudica-theming/images/logo.png',
    'logoheader' => '/opt/boudica-theming/images/logoheader.png',
    'background' => '/opt/boudica-theming/images/background.jpg',
    'favicon' => '/opt/boudica-theming/images/favicon.ico',
];

$failed = false;
foreach ($images as $key => $path) {
    if (!file_exists($path)) {
        fwrite(STDERR, "[apply-theming] Missing $path for key $key\n");
        $failed = true;
        continue;
    }
    try {
        $mime = $imageManager->updateImage($key, $path);
        $themingDefaults->set($key . 'Mime', $mime);
        echo "[apply-theming] OK $key -> $mime\n";
    } catch (\Throwable $e) {
        fwrite(STDERR, "[apply-theming] FAILED $key: " . $e->getMessage() . "\n");
        $failed = true;
    }
}

exit($failed ? 1 : 0);
