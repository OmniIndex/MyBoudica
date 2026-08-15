# Boudica AI Nextcloud App - User Interface

A complete user interface for the Boudica AI integration in Nextcloud. The app provides a modern, responsive shell with sections for Chat, Documents, Emails, Calendar integration, and Settings.

## Features

✨ **Navigation Sidebar**
- Easy access to all major features
- Active state indicators
- Responsive design

📱 **5 Main View Components**
1. **Home Dashboard** - Quick access cards to all features
2. **Chat Interface** - Real-time conversation with Boudica AI
3. **Document Management** - Upload and analyze documents
4. **Email Assistant** - Interact with your emails using AI
5. **Calendar Integration** - View and manage events with AI insights
6. **Settings** - User preferences and integrations

🎨 **Design System**
- Nextcloud Vue components for consistency
- Lucide Vue icons for beautiful graphics
- Responsive CSS Grid layouts
- Dark/light mode support (via Nextcloud theming)
- Smooth animations and transitions

## Project Structure

```
nextcloud/boudicaai/
├── src/
│   ├── App.vue                 # Main application shell
│   ├── main.ts                 # Vue app entry point
│   └── components/             # Individual view components
│       ├── ChatView.vue
│       ├── DocumentsView.vue
│       ├── EmailsView.vue
│       ├── CalendarView.vue
│       └── SettingsView.vue
├── templates/
│   └── index.php              # PHP template (loads Vue app)
├── lib/
│   ├── Controller/
│   │   ├── PageController.php  # Routes requests to index template
│   │   ├── ApiController.php   # API endpoints
│   │   └── SettingsController.php
│   └── Listener/
│       └── TalkBotInvokeListener.php  # Talk integration
├── vite.config.ts             # Vite build configuration
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## Setup & Build

### 1. Install Dependencies
```bash
cd nextcloud/boudicaai
npm install
```

This will install:
- Vue 3
- Nextcloud Vue components
- Lucide Vue icons
- TypeScript build tools

### 2. Development Mode
```bash
npm run watch
```
This watches for file changes and rebuilds automatically.

### 3. Production Build
```bash
npm run build
```
Creates optimized production bundles.

### 4. Lint Code
```bash
npm run lint           # Check JavaScript/TypeScript
npm run stylelint      # Check CSS/SCSS
```

## Extending the App

### Adding a New Feature Section

1. **Create a new component** in `src/components/YourFeature.vue`:
```vue
<template>
  <div :class="$style.container">
    <h1>{{ t('boudicaai', 'Your Feature') }}</h1>
    <!-- Your content here -->
  </div>
</template>

<script setup lang="ts">
// Your feature logic
</script>

<style module>
.container {
  padding: 24px;
}
</style>
```

2. **Import it** in `src/App.vue`:
```typescript
import YourFeatureView from './components/YourFeature.vue'
```

3. **Add navigation item** in the sidebar:
```vue
<NcAppNavigationItem
  :name="t('boudicaai', 'Your Feature')"
  @click="currentView = 'yourfeature'"
>
  <template #icon>
    <YourIcon :size="20" />
  </template>
</NcAppNavigationItem>
```

4. **Add view rendering**:
```vue
<YourFeatureView v-else-if="currentView === 'yourfeature'" />
```

### Integrating with Backend APIs

Each component has `// TODO: Send to backend API` comments where you should add integration code.

#### Example: ChatView Integration
```typescript
const sendMessage = async () => {
  // Add user message to UI
  messages.value.push({
    role: 'user',
    content: inputMessage.value,
  })

  // Send to backend
  try {
    const response = await fetch('/ocs/v2.php/apps/boudicaai/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OCS-APIRequest': 'true',
      },
      body: JSON.stringify({
        prompt: inputMessage.value,
        conversation_id: currentConversationId.value,
      }),
    })

    const data = await response.json()
    
    // Add AI response to UI
    messages.value.push({
      role: 'assistant',
      content: data.ocs.data.response,
    })
  } catch (error) {
    console.error('Error sending message:', error)
  }

  inputMessage.value = ''
}
```

### Connecting to Existing Integrations

The app already has listeners for:
- **Talk Bot** - Handled by `TalkBotInvokeListener.php`
- **Email Integration** - Ready in EmailsView
- **Calendar Integration** - Ready in CalendarView
- **Document Management** - Ready in DocumentsView

To activate these, implement the corresponding API endpoints in `lib/Controller/ApiController.php`.

## API Endpoints to Implement

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/chat` | POST | Send chat message, get response |
| `/api/v1/documents` | GET/POST | List and upload documents |
| `/api/v1/documents/{id}` | GET | Get document details |
| `/api/v1/emails` | GET | List user emails |
| `/api/v1/calendar` | GET | Get calendar events |
| `/api/v1/settings` | GET/POST | Save/retrieve user settings |

## Translation Support

The app uses Nextcloud's translation system. Text is wrapped with:
```vue
{{ t('boudicaai', 'Your text here') }}
```

Translation strings are automatically extracted during build. Add new strings and they'll be ready for translation.

## Styling Guidelines

The app uses CSS Modules for component-scoped styles. Follow this pattern:

```vue
<style module>
.container {
  /* Your styles */
}
</style>
```

Use Nextcloud CSS variables for theming:
- `var(--color-primary)` - Primary brand color
- `var(--color-main-text)` - Main text color
- `var(--color-text-lighter)` - Secondary text
- `var(--color-main-background)` - Background color
- `var(--color-border)` - Border color
- `var(--color-background-secondary)` - Secondary background

See [Nextcloud Design Guidelines](https://docs.nextcloud.com/server/latest/developer_manual/design/) for complete reference.

## Performance Optimization

- Components are lazy-loaded via Vue's dynamic imports
- Images use Nextcloud's image optimization
- CSS is scoped to prevent conflicts
- Animations use CSS transforms for smooth performance
- Messages are virtualized (add if you have >1000 items)

## Troubleshooting

### Build fails with "Module not found"
```bash
npm install
npm run build
```

### Icons not showing
Ensure `lucide-vue-next` is installed:
```bash
npm install lucide-vue-next
```

### Styling not applied
- Clear browser cache (Ctrl+Shift+Delete)
- Check that CSS Module syntax is correct (`:class="$style.className"`)
- Verify you're using `module` in the style tag

### API calls return 401
- Check that authentication token is being sent
- Ensure CORS is properly configured in Apache
- Verify the endpoint path matches your routing

## Further Resources

- [Nextcloud Vue Components](https://nextcloud-vue.netlify.app/)
- [Nextcloud App Development](https://docs.nextcloud.com/server/latest/developer_manual/app_development/)
- [Vue 3 Documentation](https://vuejs.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## License

MIT License - See LICENSE file for details
