<?php
script('boudicaai', 'admin-settings');
style('boudicaai', 'admin-settings');
?>

<div id="boudicaai-admin-settings" class="section">
    <h2><?php p($l->t('Boudica AI Settings')); ?></h2>

    <p>
        <label for="boudica-api-key"><?php p($l->t('API Key')); ?></label><br>
        <input type="password" id="boudica-api-key" name="api_key"
               value="<?php p($_['api_key']); ?>"
               style="width: 400px;" />
    </p>

    <p>
        <label for="boudica-api-endpoint"><?php p($l->t('API Endpoint')); ?></label><br>
        <input type="text" id="boudica-api-endpoint" name="api_endpoint"
               value="<?php p($_['api_endpoint']); ?>"
               style="width: 400px;" />
    </p>

    <p>
        <label for="boudica-user-id"><?php p($l->t('User ID')); ?></label><br>
        <input type="text" id="boudica-user-id" name="user_id"
               value="<?php p($_['user_id']); ?>"
               style="width: 400px;" />
    </p>

    <button id="boudica-save">Save</button>
    <span id="boudica-save-msg"></span>
</div>