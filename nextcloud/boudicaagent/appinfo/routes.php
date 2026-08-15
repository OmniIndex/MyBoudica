<?php

// All agent CRUD/run calls go straight from the browser to
// https://boudi.ca's /api/boudica/agents/* endpoints (same
// direct-from-browser pattern as boudicacode/boudicadashboard) —
// no PHP proxy. This app's PHP side only mounts the page shell.

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
    ],
];
