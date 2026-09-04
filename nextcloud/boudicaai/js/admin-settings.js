document.addEventListener('DOMContentLoaded', function () {
    if ( !document.getElementById('boudica-save') ) {
        return;
    }
    try {
        const saveBtn = document.getElementById('boudica-save');
        saveBtn.addEventListener('click', function () {
            const apiKey = document.getElementById('boudica-api-key').value;
            const apiEndpoint = document.getElementById('boudica-api-endpoint').value;
            const userId = document.getElementById('boudica-user-id').value;

            fetch(OC.generateUrl('/apps/boudicaai/settings'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'requesttoken': OC.requestToken,
                },
                body: JSON.stringify({ api_key: apiKey, api_endpoint: apiEndpoint, user_id: userId }),
            })
            .then(res => res.json())
            .then(() => {
                document.getElementById('boudica-save-msg').innerText = 'Saved!';
            });
        });
    } catch ( err ) {
        console.error('Error initializing Boudica settings:', err);
    }
});