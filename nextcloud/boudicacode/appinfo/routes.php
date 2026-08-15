<?php

// Routes for Boudica Code.
// index: serves the full-page app shell (loads the JS bundle).
// File CRUD/browsing AND the AI agent (project scaffolding, code
// generation, edits) all go straight from the frontend to WebDAV /
// Boudica respectively — see js/src/chat/boudicaApi.js's docblock for
// why there's no PHP proxy for the AI calls. This app's PHP side is
// deliberately thin: mount the UI, serve vendored assets, zip
// downloads, and run the compile-check toolchain.

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        [
            'name' => 'monacoAssets#serve',
            'url' => '/vendor-assets/{path}',
            'verb' => 'GET',
            'requirements' => ['path' => '.+'],
        ],
        [
            'name' => 'projectDownload#download',
            'url' => '/download-zip',
            'verb' => 'GET',
        ],
        [
            'name' => 'compile#check',
            'url' => '/compile-check',
            'verb' => 'POST',
        ],
        [
            'name' => 'docs#serve',
            'url' => '/docs/{path}',
            'verb' => 'GET',
            'requirements' => ['path' => '.+'],
        ],
    ],
];
