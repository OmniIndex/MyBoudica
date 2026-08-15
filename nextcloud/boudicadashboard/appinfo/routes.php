<?php

// Routes for Boudica Dashboard.
// index: serves the page shell (loads the JS bundle).
// All dashboard data comes straight from the frontend calling
// https://myboudica.com's /dashboard/* endpoints directly (same
// pattern as boudicacode's boudicaApi.js) — there is no PHP proxy
// for that data, so this app's PHP side only mounts the UI and
// serves vendored assets (Chart.js).

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
    ],
];
