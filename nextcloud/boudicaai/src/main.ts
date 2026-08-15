import { createApp } from 'vue'
import App from './App.vue'

// Define translation function BEFORE creating app
function t(appName: string, text: string): string {
	// Try Nextcloud's global t function
	if (typeof (window as any).t === 'function') {
		try {
			return (window as any).t(appName, text)
		} catch (e) {
			return text
		}
	}
	// Fallback to original text
	return text
}

const app = createApp(App)
app.config.globalProperties.t = t
app.mount('#boudicaai')
