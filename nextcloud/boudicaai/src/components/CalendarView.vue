<template>
	<div :class="$style.container">
		<div :class="$style.header">
			<h1>{{ t('boudicaai', 'Calendar') }}</h1>
			<p class="subtitle">{{ t('boudicaai', 'View and manage calendar events with AI insights') }}</p>
		</div>

		<div :class="$style.toolbar">
			<div :class="$style.viewOptions">
				<button
					v-for="view in ['day', 'week', 'month']"
					:key="view"
					:class="[$style.viewButton, { [$style.active]: currentView === view }]"
					@click="currentView = view"
				>
					{{ t('boudicaai', capitalize(view)) }}
				</button>
			</div>
		</div>

		<div :class="$style.content">
			<div :class="$style.emptyState">
				<CalendarIcon :size="48" />
				<p>{{ t('boudicaai', 'No events available') }}</p>
				<p class="help-text">{{ t('boudicaai', 'Connect your calendar to view events') }}</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CalendarIcon } from 'lucide-vue-next'

const currentView = ref('month')

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
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

.viewOptions {
	display: flex;
	gap: 8px;
	background: var(--color-background-secondary);
	border-radius: 6px;
	padding: 4px;
}

.viewButton {
	padding: 8px 16px;
	border: none;
	background: transparent;
	color: var(--color-text-lighter);
	border-radius: 4px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 500;
	transition: all 0.2s ease;
}

.viewButton:hover {
	background: rgba(0, 0, 0, 0.05);
}

.viewButton.active {
	background: var(--color-primary);
	color: white;
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
