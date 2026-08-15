<script setup lang="ts">
import { ref, computed } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcAppNavigation from '@nextcloud/vue/components/NcAppNavigation'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import ChatView from './components/ChatView.vue'
import DocumentsView from './components/DocumentsView.vue'
import EmailsView from './components/EmailsView.vue'
import CalendarView from './components/CalendarView.vue'
import SettingsView from './components/SettingsView.vue'
import {
	HomeIcon,
	MessageSquareIcon,
	FileTextIcon,
	MailIcon,
	CalendarIcon,
	SettingsIcon,
} from 'lucide-vue-next'

type NavItem = 'home' | 'chat' | 'documents' | 'emails' | 'calendar' | 'settings'

const currentView = ref<NavItem>('home')

// Declare translations directly (no function call in template)
const translations = {
	home: 'Home',
	chat: 'Chat',
	documents: 'Documents',
	emails: 'Emails',
	calendar: 'Calendar',
	settings: 'Settings',
	boudica_title: 'Boudica AI Assistant',
	boudica_subtitle: 'Your intelligent assistant for Nextcloud',
	quick_chat: 'Quick Chat',
	quick_chat_desc: 'Start a conversation with Boudica AI',
	open_chat: 'Open Chat',
	doc_analysis: 'Document Analysis',
	doc_analysis_desc: 'Analyze and work with your documents',
	browse_docs: 'Browse Documents',
	email_assist: 'Email Assistant',
	email_assist_desc: 'Get AI assistance with your emails',
	view_emails: 'View Emails',
	calendar_int: 'Calendar Integration',
	calendar_int_desc: 'AI insights for your calendar events',
	view_calendar: 'View Calendar',
}
</script>

<template>
	<NcContent app-name="boudicaai">
		<NcAppNavigation :class="$style.sidebar">
			<template #list>
				<NcAppNavigationItem
				:name="translations.home"
					:to="{ name: 'home' }"
					:class="{ [$style.active]: currentView === 'home' }"
					@click="currentView = 'home'"
				>
					<template #icon>
						<HomeIcon :size="20" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem
				:name="translations.chat"
					:to="{ name: 'chat' }"
					:class="{ [$style.active]: currentView === 'chat' }"
					@click="currentView = 'chat'"
				>
					<template #icon>
						<MessageSquareIcon :size="20" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem
				:name="translations.documents"
					:to="{ name: 'documents' }"
					:class="{ [$style.active]: currentView === 'documents' }"
					@click="currentView = 'documents'"
				>
					<template #icon>
						<FileTextIcon :size="20" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem
				:name="translations.emails"
					:to="{ name: 'emails' }"
					:class="{ [$style.active]: currentView === 'emails' }"
					@click="currentView = 'emails'"
				>
					<template #icon>
						<MailIcon :size="20" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem
				:name="translations.calendar"
					:to="{ name: 'calendar' }"
					:class="{ [$style.active]: currentView === 'calendar' }"
					@click="currentView = 'calendar'"
				>
					<template #icon>
						<CalendarIcon :size="20" />
					</template>
				</NcAppNavigationItem>
			</template>
			<template #footer>
				<NcAppNavigationItem
				:name="translations.settings"
					:to="{ name: 'settings' }"
					:class="{ [$style.active]: currentView === 'settings' }"
					@click="currentView = 'settings'"
				>
					<template #icon>
						<SettingsIcon :size="20" />
					</template>
				</NcAppNavigationItem>
			</template>
		</NcAppNavigation>

		<NcAppContent :class="$style.content">
			<div v-if="currentView === 'home'" :class="$style.homeView">
				<div :class="$style.header">
				<h1>{{ translations.boudica_title }}</h1>
				<p class="subtitle">{{ translations.boudica_subtitle }}</p>
				</div>

				<div :class="$style.cardsGrid">
					<div :class="$style.card" @click="currentView = 'chat'">
						<div :class="$style.cardIcon">
							<MessageSquareIcon :size="32" />
						</div>
					<h3>{{ translations.quick_chat }}</h3>
					<p>{{ translations.quick_chat_desc }}</p>
					<NcButton type="primary" @click="currentView = 'chat'">
						{{ translations.open_chat }}
						</NcButton>
					</div>

					<div :class="$style.card" @click="currentView = 'documents'">
						<div :class="$style.cardIcon">
							<FileTextIcon :size="32" />
						</div>
					<h3>{{ translations.doc_analysis }}</h3>
					<p>{{ translations.doc_analysis_desc }}</p>
					<NcButton type="primary" @click="currentView = 'documents'">
						{{ translations.browse_docs }}
						</NcButton>
					</div>

					<div :class="$style.card" @click="currentView = 'emails'">
						<div :class="$style.cardIcon">
							<MailIcon :size="32" />
						</div>
					<h3>{{ translations.email_assist }}</h3>
					<p>{{ translations.email_assist_desc }}</p>
					<NcButton type="primary" @click="currentView = 'emails'">
						{{ translations.view_emails }}
						</NcButton>
					</div>

					<div :class="$style.card" @click="currentView = 'calendar'">
						<div :class="$style.cardIcon">
							<CalendarIcon :size="32" />
						</div>
					<h3>{{ translations.calendar_int }}</h3>
					<p>{{ translations.calendar_int_desc }}</p>
					<NcButton type="primary" @click="currentView = 'calendar'">
						{{ translations.view_calendar }}
						</NcButton>
					</div>
				</div>
			</div>

			<ChatView v-else-if="currentView === 'chat'" />
			<DocumentsView v-else-if="currentView === 'documents'" />
			<EmailsView v-else-if="currentView === 'emails'" />
			<CalendarView v-else-if="currentView === 'calendar'" />
			<SettingsView v-else-if="currentView === 'settings'" />
		</NcAppContent>
	</NcContent>
</template>

<style module>
.sidebar {
	width: 250px;
	background: var(--color-main-background-blur);
	border-right: 1px solid var(--color-border);
}

.active {
	background: var(--color-primary-light);
	color: var(--color-primary);
}

.content {
	flex: 1;
	overflow-y: auto;
	background: var(--color-main-background);
}

.homeView {
	max-width: 1200px;
	margin: 0 auto;
	padding: 24px;
	animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
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
	font-size: 16px;
	color: var(--color-text-lighter);
	margin: 0;
}

.cardsGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 20px;
	margin-top: 24px;
}

.card {
	cursor: pointer;
	transition: all 0.2s ease;
	padding: 24px;
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	border-color: var(--color-primary);
}

.cardIcon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 56px;
	height: 56px;
	background: var(--color-primary-light);
	border-radius: 8px;
	color: var(--color-primary);
}

.card h3 {
	font-size: 18px;
	font-weight: 600;
	margin: 0;
	color: var(--color-main-text);
}

.card p {
	font-size: 14px;
	color: var(--color-text-lighter);
	margin: 0;
	flex-grow: 1;
}
</style>
