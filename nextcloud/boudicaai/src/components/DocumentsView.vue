<template>
	<div :class="$style.container">
		<div :class="$style.header">
			<h1>{{ t('boudicaai', 'Documents') }}</h1>
			<p class="subtitle">{{ t('boudicaai', 'Upload and analyze your documents with AI assistance') }}</p>
		</div>

		<div :class="$style.toolbar">
			<NcButton type="primary">
				{{ t('boudicaai', '+ Upload Document') }}
			</NcButton>
		</div>

		<div :class="$style.content">
			<div :class="$style.emptyState">
				<FileTextIcon :size="48" />
				<p>{{ t('boudicaai', 'No documents yet') }}</p>
				<p class="help-text">{{ t('boudicaai', 'Upload a document to get started') }}</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import NcButton from '@nextcloud/vue/components/NcButton'
import { FileTextIcon } from 'lucide-vue-next'
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
