/**
 * Torc Private UI Module
 * Handles UI for Torc Private projects - similar to Claude Projects
 */

class TorcPrivateUI {
    constructor(storage, chatAPI) {
        this.storage = storage;
        this.chatAPI = chatAPI;
        this.currentProject = null;
        this.currentChat = null;
        this.flyoutOpen = false;
        
        this.initializeElements();
        this.attachEventListeners();
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Create Torc Private button in sidebar
        this.createTorcPrivateButton();
        
        // Create flyout panel
        this.createFlyoutPanel();
    }

    /**
     * Create Torc Private button in sidebar
     */
    createTorcPrivateButton() {
        const sidebar = document.querySelector('.sidebar');
        const sidebarHeader = sidebar.querySelector('.sidebar-header');
        
        // Create Torc Private section after new chat button
        const torcSection = document.createElement('div');
        torcSection.className = 'torc-private-section';
        torcSection.innerHTML = `
            <button id="torcPrivateBtn" class="btn btn-torc-private" title="Torc Private Projects">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L2 6V10C2 14.5 5.5 18.5 10 20C14.5 18.5 18 14.5 18 10V6L10 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Torc Private
                <span class="torc-badge" id="torcBadge">0</span>
            </button>
        `;
        
        sidebarHeader.appendChild(torcSection);
        this.torcButton = document.getElementById('torcPrivateBtn');
        this.torcBadge = document.getElementById('torcBadge');
    }

    /**
     * Create flyout panel
     */
    createFlyoutPanel() {
        const flyout = document.createElement('div');
        flyout.id = 'torcPrivateFlyout';
        flyout.className = 'torc-flyout hidden';
        flyout.innerHTML = `
            <div class="torc-flyout-header">
                <h2>Torc Private</h2>
                <button id="closeFlyout" class="btn btn-icon" title="Close">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M6 6L14 14M6 14L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            
            <div class="torc-flyout-actions">
                <button id="newProjectBtn" class="btn btn-primary">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    New Project
                </button>
                <input type="text" id="projectSearch" class="project-search" placeholder="Search projects..." />
            </div>
            
            <div class="torc-projects-list" id="torcProjectsList">
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 20 20" fill="none">
                        <path d="M3 6C3 4.89543 3.89543 4 5 4H9L11 6H15C16.1046 6 17 6.89543 17 8V14C17 15.1046 16.1046 16 15 16H5C3.89543 16 3 15.1046 3 14V6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <p>No projects yet</p>
                    <p class="text-muted">Create a project to add documents and have private chats</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(flyout);
        this.flyout = flyout;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Torc Private button
        this.torcButton.addEventListener('click', () => this.toggleFlyout());
        
        // Close flyout
        document.getElementById('closeFlyout').addEventListener('click', () => this.closeFlyout());
        
        // Click outside to close
        this.flyout.addEventListener('click', (e) => {
            if (e.target === this.flyout) {
                this.closeFlyout();
            }
        });
        
        // New project button
        document.getElementById('newProjectBtn').addEventListener('click', () => this.showNewProjectDialog());
        
        // Project search
        document.getElementById('projectSearch').addEventListener('input', (e) => this.searchProjects(e.target.value));
    }

    /**
     * Toggle flyout panel
     */
    async toggleFlyout() {
        if (this.flyoutOpen) {
            this.closeFlyout();
        } else {
            await this.openFlyout();
        }
    }

    /**
     * Open flyout panel
     */
    async openFlyout() {
        this.flyoutOpen = true;
        this.flyout.classList.remove('hidden');
        this.flyout.classList.add('visible');
        await this.loadProjects();
    }

    /**
     * Close flyout panel
     */
    closeFlyout() {
        this.flyoutOpen = false;
        this.flyout.classList.remove('visible');
        this.flyout.classList.add('hidden');
    }

    /**
     * Load and display projects
     */
    async loadProjects() {
        const projects = await this.storage.getAllProjects();
        this.updateProjectsBadge(projects.length);
        this.renderProjects(projects);
    }

    /**
     * Update projects badge count
     */
    updateProjectsBadge(count) {
        this.torcBadge.textContent = count;
        this.torcBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    /**
     * Render projects list
     */
    renderProjects(projects) {
        const container = document.getElementById('torcProjectsList');
        
        if (projects.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 20 20" fill="none">
                        <path d="M3 6C3 4.89543 3.89543 4 5 4H9L11 6H15C16.1046 6 17 6.89543 17 8V14C17 15.1046 16.1046 16 15 16H5C3.89543 16 3 15.1046 3 14V6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <p>No projects yet</p>
                    <p class="text-muted">Create a project to add documents and have private chats</p>
                </div>
            `;
            return;
        }

        container.innerHTML = projects.map(project => `
            <div class="project-item" data-project-id="${project.id}">
                <div class="project-icon" style="background-color: ${project.color}">
                    ${project.icon}
                </div>
                <div class="project-info">
                    <div class="project-name">${this.escapeHtml(project.name)}</div>
                    <div class="project-meta">
                        <span>${project.documentCount || 0} docs</span>
                        <span>•</span>
                        <span>${project.chatCount || 0} chats</span>
                    </div>
                </div>
                <div class="project-actions">
                    <button class="btn btn-icon project-menu-btn" data-project-id="${project.id}">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="5" r="1.5" fill="currentColor"/>
                            <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
                            <circle cx="10" cy="15" r="1.5" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Attach event listeners to project items
        container.querySelectorAll('.project-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.project-menu-btn')) {
                    const projectId = item.dataset.projectId;
                    this.openProject(projectId);
                }
            });
        });

        // Attach event listeners to menu buttons
        container.querySelectorAll('.project-menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.dataset.projectId;
                this.showProjectMenu(projectId, btn);
            });
        });
    }

    /**
     * Search projects
     */
    async searchProjects(query) {
        if (!query.trim()) {
            await this.loadProjects();
            return;
        }

        const results = await this.storage.search(query);
        this.renderProjects(results.projects);
    }

    /**
     * Show new project dialog
     */
    async showNewProjectDialog() {
        const name = prompt('Enter project name:');
        if (!name || !name.trim()) return;

        const description = prompt('Enter project description (optional):');

        try {
            const project = await this.storage.createProject(name.trim(), description?.trim() || '');
            await this.loadProjects();
            this.openProject(project.id);
        } catch (error) {
            console.error('Failed to create project:', error);
            alert('Failed to create project. Please try again.');
        }
    }

    /**
     * Open a project
     */
    async openProject(projectId) {
        this.currentProject = await this.storage.getProject(projectId);
        if (!this.currentProject) {
            alert('Project not found');
            return;
        }

        this.closeFlyout();
        this.showProjectView();
    }

    /**
     * Show project view with documents and chats
     */
    async showProjectView() {
        // Create project view overlay
        const overlay = document.createElement('div');
        overlay.id = 'projectViewOverlay';
        overlay.className = 'project-view-overlay';
        overlay.innerHTML = `
            <div class="project-view-container">
                <div class="project-view-header">
                    <button id="backToProjects" class="btn btn-icon">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <div class="project-title">
                        <span class="project-icon" style="background-color: ${this.currentProject.color}">${this.currentProject.icon}</span>
                        <h2>${this.escapeHtml(this.currentProject.name)}</h2>
                    </div>
                    <button id="closeProjectView" class="btn btn-icon">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M6 6L14 14M6 14L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                
                <div class="project-view-content">
                    <div class="project-sidebar">
                        <div class="project-section">
                            <div class="project-section-header">
                                <h3>Documents</h3>
                                <button id="addDocumentBtn" class="btn btn-icon" title="Add document">
                                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                        <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div id="projectDocuments" class="document-list"></div>
                        </div>
                        
                        <div class="project-section">
                            <div class="project-section-header">
                                <h3>Private Chats</h3>
                                <button id="newPrivateChatBtn" class="btn btn-icon" title="New chat">
                                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                        <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div id="projectChats" class="chat-list"></div>
                        </div>
                    </div>
                    
                    <div class="project-main">
                        <div class="project-empty-state">
                            <p>Select a chat or document to start</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Attach event listeners
        document.getElementById('backToProjects').addEventListener('click', () => {
            overlay.remove();
            this.openFlyout();
        });

        document.getElementById('closeProjectView').addEventListener('click', () => {
            overlay.remove();
        });

        document.getElementById('addDocumentBtn').addEventListener('click', () => this.addDocument());
        document.getElementById('newPrivateChatBtn').addEventListener('click', () => this.createPrivateChat());

        // Load documents and chats
        await this.loadProjectData();
    }

    /**
     * Load project documents and chats
     */
    async loadProjectData() {
        const documents = await this.storage.getProjectDocuments(this.currentProject.id);
        const chats = await this.storage.getProjectChats(this.currentProject.id);

        this.renderDocuments(documents);
        this.renderChats(chats);
    }

    /**
     * Render documents list
     */
    renderDocuments(documents) {
        const container = document.getElementById('projectDocuments');
        
        if (documents.length === 0) {
            container.innerHTML = '<p class="empty-message">No documents</p>';
            return;
        }

        container.innerHTML = documents.map(doc => `
            <div class="document-item" data-doc-id="${doc.id}">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M6 2H14L18 6V16C18 17.1046 17.1046 18 16 18H6C4.89543 18 4 17.1046 4 16V4C4 2.89543 4.89543 2 6 2Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 2V6H18" stroke="currentColor" stroke-width="2"/>
                </svg>
                <span class="document-name">${this.escapeHtml(doc.name)}</span>
                <button class="btn btn-icon document-delete-btn" data-doc-id="${doc.id}">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                        <path d="M6 6L14 14M6 14L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');

        // Attach event listeners
        container.querySelectorAll('.document-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.document-delete-btn')) {
                    const docId = item.dataset.docId;
                    this.viewDocument(docId);
                }
            });
        });

        container.querySelectorAll('.document-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const docId = btn.dataset.docId;
                if (confirm('Delete this document?')) {
                    await this.storage.deleteDocument(docId);
                    await this.loadProjectData();
                }
            });
        });
    }

    /**
     * Render chats list
     */
    renderChats(chats) {
        const container = document.getElementById('projectChats');
        
        if (chats.length === 0) {
            container.innerHTML = '<p class="empty-message">No private chats</p>';
            return;
        }

        container.innerHTML = chats.map(chat => `
            <div class="chat-item" data-chat-id="${chat.id}">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M6 8C6 4.68629 8.68629 2 12 2C15.3137 2 18 4.68629 18 8C18 11.3137 15.3137 14 12 14L6 18V14C3.79086 14 2 12.2091 2 10V8C2 5.79086 3.79086 4 6 4Z" stroke="currentColor" stroke-width="2"/>
                </svg>
                <span class="chat-name">${this.escapeHtml(chat.title)}</span>
                <button class="btn btn-icon chat-delete-btn" data-chat-id="${chat.id}">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                        <path d="M6 6L14 14M6 14L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');

        // Attach event listeners
        container.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.chat-delete-btn')) {
                    const chatId = item.dataset.chatId;
                    this.openPrivateChat(chatId);
                }
            });
        });

        container.querySelectorAll('.chat-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const chatId = btn.dataset.chatId;
                if (confirm('Delete this chat and all its messages?')) {
                    await this.storage.deletePrivateChat(chatId);
                    await this.loadProjectData();
                }
            });
        });
    }

    /**
     * Add document to project
     */
    async addDocument() {
        const name = prompt('Enter document name:');
        if (!name || !name.trim()) return;

        const content = prompt('Enter document content (or paste text):');
        if (content === null) return;

        try {
            await this.storage.addDocument(this.currentProject.id, name.trim(), content, 'text/plain');
            await this.loadProjectData();
        } catch (error) {
            console.error('Failed to add document:', error);
            alert('Failed to add document. Please try again.');
        }
    }

    /**
     * View document
     */
    async viewDocument(docId) {
        const doc = await this.storage.getDocument(docId);
        if (!doc) {
            alert('Document not found');
            return;
        }

        const main = document.querySelector('.project-main');
        main.innerHTML = `
            <div class="document-view">
                <div class="document-view-header">
                    <h3>${this.escapeHtml(doc.name)}</h3>
                    <div class="document-meta">
                        Added ${new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                </div>
                <div class="document-content">
                    ${this.escapeHtml(doc.content).replace(/\n/g, '<br>')}
                </div>
            </div>
        `;
    }

    /**
     * Create new private chat
     */
    async createPrivateChat() {
        try {
            const chat = await this.storage.createPrivateChat(this.currentProject.id);
            await this.loadProjectData();
            this.openPrivateChat(chat.id);
        } catch (error) {
            console.error('Failed to create chat:', error);
            alert('Failed to create chat. Please try again.');
        }
    }

    /**
     * Open private chat
     */
    async openPrivateChat(chatId) {
        this.currentChat = await this.storage.getPrivateChat(chatId);
        if (!this.currentChat) {
            alert('Chat not found');
            return;
        }

        const messages = await this.storage.getChatMessages(chatId);
        this.renderChatView(messages);
    }

    /**
     * Render chat view
     */
    renderChatView(messages) {
        const main = document.querySelector('.project-main');
        main.innerHTML = `
            <div class="private-chat-view">
                <div class="private-chat-header">
                    <h3>${this.escapeHtml(this.currentChat.title)}</h3>
                </div>
                <div class="private-chat-messages" id="privateChatMessages">
                    ${messages.length === 0 ? '<div class="empty-chat-state">Start a conversation</div>' : ''}
                </div>
                <div class="private-chat-input">
                    <textarea id="privateChatInput" placeholder="Send a message (with project context)..." rows="3"></textarea>
                    <button id="sendPrivateChatBtn" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                            <path d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Send
                    </button>
                </div>
            </div>
        `;

        // Render existing messages
        this.renderChatMessages(messages);

        // Attach event listeners
        document.getElementById('sendPrivateChatBtn').addEventListener('click', () => this.sendPrivateMessage());
        document.getElementById('privateChatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.sendPrivateMessage();
            }
        });
    }

    /**
     * Render chat messages
     */
    renderChatMessages(messages) {
        const container = document.getElementById('privateChatMessages');
        
        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-chat-state">Start a conversation</div>';
            return;
        }

        container.innerHTML = messages.map(msg => `
            <div class="message message-${msg.role}">
                <div class="message-content">
                    ${this.escapeHtml(msg.content).replace(/\n/g, '<br>')}
                </div>
                <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Send private message
     */
    async sendPrivateMessage() {
        const input = document.getElementById('privateChatInput');
        const content = input.value.trim();
        
        if (!content) return;

        // Add user message
        await this.storage.addChatMessage(this.currentChat.id, 'user', content);
        
        // Clear input
        input.value = '';

        // Get updated messages and render
        const messages = await this.storage.getChatMessages(this.currentChat.id);
        this.renderChatMessages(messages);

        // TODO: Send to API with project context
        // Get all project documents to send as context
        const documents = await this.storage.getProjectDocuments(this.currentProject.id);
        const context = documents.map(doc => `Document: ${doc.name}\n${doc.content}`).join('\n\n');

        // Send to API (implement based on your API)
        try {
            const response = await this.chatAPI.sendMessage(content, context);
            await this.storage.addChatMessage(this.currentChat.id, 'assistant', response);
            
            const updatedMessages = await this.storage.getChatMessages(this.currentChat.id);
            this.renderChatMessages(updatedMessages);
        } catch (error) {
            console.error('Failed to get response:', error);
            await this.storage.addChatMessage(this.currentChat.id, 'assistant', 'Sorry, I encountered an error. Please try again.');
            const updatedMessages = await this.storage.getChatMessages(this.currentChat.id);
            this.renderChatMessages(updatedMessages);
        }
    }

    /**
     * Show project menu
     */
    showProjectMenu(projectId, buttonElement) {
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <button class="context-menu-item" data-action="export">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M4 12V16C4 17.1046 4.89543 18 6 18H14C15.1046 18 16 17.1046 16 16V12M12 8L10 6M10 6L8 8M10 6V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Export Project
            </button>
            <button class="context-menu-item" data-action="delete">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M6 6L14 14M6 14L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Delete Project
            </button>
        `;

        // Position menu
        const rect = buttonElement.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = rect.bottom + 'px';
        menu.style.left = rect.left + 'px';

        document.body.appendChild(menu);

        // Handle clicks
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const action = item.dataset.action;
                
                if (action === 'export') {
                    await this.exportProject(projectId);
                } else if (action === 'delete') {
                    if (confirm('Delete this project and all its data?')) {
                        await this.storage.deleteProject(projectId);
                        await this.loadProjects();
                    }
                }
                
                menu.remove();
            });
        });

        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== buttonElement) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * Export project
     */
    async exportProject(projectId) {
        try {
            const data = await this.storage.exportProject(projectId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `torc-private-${data.project.name}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export project:', error);
            alert('Failed to export project. Please try again.');
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TorcPrivateUI;
}
