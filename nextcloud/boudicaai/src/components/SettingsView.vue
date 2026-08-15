<template>
	<div :class="$style.container">
		<div :class="$style.header">
			<h1>{{ t('boudicaai', 'Settings') }}</h1>
			<p class="subtitle">{{ t('boudicaai', 'Configure your Boudica AI preferences') }}</p>
		</div>

		<div :class="$style.settingsGrid">
			<div :class="$style.section">
				<h2>{{ t('boudicaai', 'Account Settings') }}</h2>
				<div :class="$style.setting">
					<label>{{ t('boudicaai', 'Display Name') }}</label>
					<input
						v-model="settings.displayName"
						type="text"
						:class="$style.input"
						:placeholder="t('boudicaai', 'Your display name')"
					/>
				</div>
				<div :class="$style.setting">
					<label>{{ t('boudicaai', 'Email') }}</label>
					<input
						v-model="settings.email"
						type="email"
						:class="$style.input"
						:placeholder="t('boudicaai', 'your@email.com')"
						disabled
					/>
				</div>
			</div>

			<div :class="$style.section">
				<h2>{{ t('boudicaai', 'Preferences') }}</h2>
				<div :class="$style.setting">
					<label :class="$style.checkboxLabel">
						<input v-model="settings.notificationsEnabled" type="checkbox" />
						{{ t('boudicaai', 'Enable Notifications') }}
					</label>
				</div>
				<div :class="$style.setting">
					<label :class="$style.checkboxLabel">
						<input v-model="settings.darkMode" type="checkbox" />
						{{ t('boudicaai', 'Dark Mode') }}
					</label>
				</div>
			</div>

			<div :class="$style.section">
				<h2>{{ t('boudicaai', 'Integrations') }}</h2>
				<div :class="$style.setting">
					<label>{{ t('boudicaai', 'Talk Integration') }}</label>
					<select :class="$style.select">
						<option>{{ t('boudicaai', 'Connected') }}</option>
						<option>{{ t('boudicaai', 'Disconnected') }}</option>
					</select>
				</div>
				<div :class="$style.setting">
					<label>{{ t('boudicaai', 'Email Integration') }}</label>
					<select :class="$style.select">
						<option>{{ t('boudicaai', 'Not Connected') }}</option>
						<option>{{ t('boudicaai', 'Connect') }}</option>
					</select>
				</div>
				<div :class="$style.setting">
					<label>{{ t('boudicaai', 'Calendar Integration') }}</label>
					<select :class="$style.select">
						<option>{{ t('boudicaai', 'Not Connected') }}</option>
						<option>{{ t('boudicaai', 'Connect') }}</option>
					</select>
				</div>
			</div>

			<div :class="$style.section">
				<h2>{{ t('boudicaai', 'About') }}</h2>
				<div :class="$style.about">
					<p><strong>{{ t('boudicaai', 'App Version') }}:</strong> 1.0.0</p>
					<p><strong>{{ t('boudicaai', 'Backend API') }}:</strong> Boudica AI Server</p>
					<p><strong>{{ t('boudicaai', 'License') }}:</strong> MIT</p>
				</div>
			</div>
		</div>

		<div :class="$style.actions">
			<NcButton type="primary" @click="saveSettings">
				{{ t('boudicaai', 'Save Settings') }}
			</NcButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'

const settings = ref({
	displayName: '',
	email: 'user@nextcloud.local',
	notificationsEnabled: true,
	darkMode: false,
})

const saveSettings = () => {
	// TODO: Save to backend API
	console.log('Settings saved:', settings.value)
}
</script>

<style module>
.container {
	padding: 24px;
	max-width: 800px;
}

.header {
	margin-bottom: 32px;
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

.settingsGrid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 24px;
	margin-bottom: 24px;
}

.section {
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	padding: 20px;
}

.section h2 {
	font-size: 16px;
	font-weight: 600;
	margin: 0 0 16px 0;
	color: var(--color-main-text);
	border-bottom: 1px solid var(--color-border);
	padding-bottom: 12px;
}

.setting {
	margin-bottom: 16px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.setting:last-child {
	margin-bottom: 0;
}

.setting label {
	font-size: 14px;
	font-weight: 500;
	color: var(--color-main-text);
}

.input,
.select {
	padding: 8px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	font-size: 14px;
	background: var(--color-background-secondary);
	color: var(--color-main-text);
	font-family: inherit;
}

.input:focus,
.select:focus {
	border-color: var(--color-primary);
	outline: none;
	box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.1);
}

.input:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.checkboxLabel {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	font-weight: 400;
}

.checkboxLabel input {
	cursor: pointer;
	width: 16px;
	height: 16px;
}

.about {
	display: flex;
	flex-direction: column;
	gap: 8px;
	font-size: 14px;
	line-height: 1.6;
}

.about p {
	margin: 0;
	color: var(--color-main-text);
}

.about strong {
	font-weight: 600;
}

.actions {
	display: flex;
	gap: 12px;
	justify-content: flex-start;
	padding-top: 24px;
	border-top: 1px solid var(--color-border);
}
</style>
