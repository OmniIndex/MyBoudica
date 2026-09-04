<?php
/**
 * Rendered RENDER_AS_GUEST by KeycloakLoginController::callback() when
 * provision_check refuses access (seat_limit_reached, account_disabled) or
 * the OIDC exchange itself fails - never for domain_not_found, which still
 * completes a Nextcloud login onto a beta credential instead of landing
 * here. $_['message'] is one of provision_check's own already user-facing
 * strings, or a message composed in the controller for a local failure.
 */
?>
<div class="guest-box" style="max-width: 480px; margin: 10vh auto; padding: 2em; text-align: center;">
	<h2><?php p($l->t('Sign-in failed')); ?></h2>
	<p><?php p($_['message']); ?></p>
	<p><a class="button" href="<?php p($_['loginUrl']); ?>"><?php p($l->t('Back to login')); ?></a></p>
</div>
