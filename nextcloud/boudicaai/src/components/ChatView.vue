<template>
	<div :class="$style.chatContainer">
		<div :class="$style.header">
			<h1>{{ t('boudicaai', 'Chat with Boudica') }}</h1>
			<p class="subtitle">{{ t('boudicaai', 'Ask questions and get AI-powered responses') }}</p>
		</div>

		<div :class="$style.chatBox">
			<div :class="$style.messagesArea">
				<div v-if="messages.length === 0" :class="$style.emptyState">
					<MessageSquareIcon :size="48" />
					<p>{{ t('boudicaai', 'No messages yet. Start a conversation!') }}</p>
				</div>
				<div v-for="(msg, idx) in messages" :key="idx" :class="[$style.message, $style[msg.role]]">
					<div :class="$style.messageContent">
						{{ msg.content }}
					</div>
				</div>
			</div>

			<div :class="$style.inputArea">
				<textarea
					v-model="inputMessage"
					:placeholder="t('boudicaai', 'Type your message here...')"
					:class="$style.messageInput"
					@keydown.enter.ctrl="sendMessage"
				/>
				<NcButton
					:disabled="!inputMessage.trim()"
					type="primary"
					@click="sendMessage"
				>
					{{ t('boudicaai', 'Send') }}
				</NcButton>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import { MessageSquareIcon } from 'lucide-vue-next'

interface Message {
	role: 'user' | 'assistant'
	content: string
}

const messages = ref<Message[]>([])
const inputMessage = ref('')

const sendMessage = () => {
	if (!inputMessage.value.trim()) return

	// Add user message
	messages.value.push({
		role: 'user',
		content: inputMessage.value,
	})

	// TODO: Send to backend API
	// For now, add a placeholder response
	setTimeout(() => {
		messages.value.push({
			role: 'assistant',
			content: t('boudicaai', 'Response from Boudica AI will appear here. Connect to your backend API.'),
		})
	}, 500)

	inputMessage.value = ''
}
</script>

<style module>
.chatContainer {
	display: flex;
	flex-direction: column;
	height: 100%;
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

.chatBox {
	display: flex;
	flex-direction: column;
	flex: 1;
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	overflow: hidden;
}

.messagesArea {
	flex: 1;
	overflow-y: auto;
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 16px;
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

.message {
	display: flex;
	margin-bottom: 12px;
	animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
	from {
		opacity: 0;
		transform: translateY(10px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.message.user {
	justify-content: flex-end;
}

.message.assistant {
	justify-content: flex-start;
}

.messageContent {
	max-width: 70%;
	padding: 12px 16px;
	border-radius: 8px;
	line-height: 1.5;
}

.message.user .messageContent {
	background: var(--color-primary);
	color: white;
}

.message.assistant .messageContent {
	background: var(--color-background-secondary);
	color: var(--color-main-text);
	border: 1px solid var(--color-border);
}

.inputArea {
	display: flex;
	gap: 12px;
	padding: 16px;
	border-top: 1px solid var(--color-border);
	background: var(--color-background-secondary);
}

.messageInput {
	flex: 1;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	font-family: inherit;
	font-size: 14px;
	resize: none;
	max-height: 100px;
	background: var(--color-main-background);
	color: var(--color-main-text);
}

.messageInput:focus {
	border-color: var(--color-primary);
	outline: none;
}
</style>
