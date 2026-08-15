<template>
	<div :class="$style.container">
		<div :class="$style.header">
			<h1>{{ t('boudicaai', 'Emails') }}</h1>
			<p class="subtitle">{{ t('boudicaai', 'Access and interact with your emails using AI') }}</p>
		</div>

		<div :class="$style.toolbar">
			<div :class="$style.filters">
				<select :class="$style.filterSelect">
					<option>{{ t('boudicaai', 'All Emails') }}</option>
					<option>{{ t('boudicaai', 'Unread') }}</option>
					<option>{{ t('boudicaai', 'Starred') }}</option>
				</select>
			</div>
		</div>

		<div :class="$style.content">
			<div :class="$style.emptyState">
				<MailIcon :size="48" />
				<p>{{ t('boudicaai', 'No emails available') }}</p>
				<p class="help-text">{{ t('boudicaai', 'Connect your email account to get started') }}</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { MailIcon } from 'lucide-vue-next'
</script>

<style module>
.container {
	padding: 24px;
}

.header {
	margin-bottom: 24px;
}

.header h1 {
	font-size: 28px;
	font-weight: 600;
	margin: 0 0 8px 0;
	color: var(--color-main-text);
}

.header .subtitle {
	font-size: 14px;
	color: var(--color-text-lighter);
	margin: 0;
}

.toolbar {
	display: flex;
	gap: 12px;
	margin-bottom: 24px;
}

.filters {
	display: flex;
	gap: 12px;
	align-items: center;
}

.filterSelect {
	padding: 8px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 14px;
	cursor: pointer;
}

.filterSelect:focus {
	border-color: var(--color-primary);
	outline: none;
}

.content {
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	padding: 60px 20px;
	min-height: 400px;
}

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	color: var(--color-text-lighter);
	text-align: center;
}

.emptyState p {
	margin: 12px 0;
}

.emptyState .help-text {
	font-size: 14px;
	color: var(--color-text-lighter);
}
</style>
