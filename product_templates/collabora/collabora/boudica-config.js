// Loaded before boudica_widget.js. Kept as a separate file (not inlined
// into cool.html) specifically so it can be bind-mounted over at deploy
// time - see setup.sh / docker-compose.yml - without touching cool.html
// itself, which the Dockerfile only patches once at build time.
window.BoudicaConfig = {
    apiEndpoint: '__BOUDICA_API_BASE__',
    position: 'bottom-right',
    marginTop: null,
    marginBottom: null,
    marginLeft: null,
    marginRight: null,
    accentColor: '#B8860B',
    autoOpen: false
};
