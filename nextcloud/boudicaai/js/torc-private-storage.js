/**
 * Torc Private Storage Module
 * Handles IndexedDB storage for private projects, documents, and chat history
 * Similar to Claude Projects - completely client-side storage
 */

class TorcPrivateStorage {
    constructor() {
        this.dbName = 'BoudicaTorcPrivate';
        this.dbVersion = 1;
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB failed to open:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Projects store
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectStore.createIndex('name', 'name', { unique: false });
                    projectStore.createIndex('createdAt', 'createdAt', { unique: false });
                    projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // Documents store
                if (!db.objectStoreNames.contains('documents')) {
                    const documentStore = db.createObjectStore('documents', { keyPath: 'id' });
                    documentStore.createIndex('projectId', 'projectId', { unique: false });
                    documentStore.createIndex('name', 'name', { unique: false });
                    documentStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Private chats store
                if (!db.objectStoreNames.contains('privateChats')) {
                    const chatStore = db.createObjectStore('privateChats', { keyPath: 'id' });
                    chatStore.createIndex('projectId', 'projectId', { unique: false });
                    chatStore.createIndex('createdAt', 'createdAt', { unique: false });
                    chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // Chat messages store (separate for better performance)
                if (!db.objectStoreNames.contains('privateChatMessages')) {
                    const messageStore = db.createObjectStore('privateChatMessages', { keyPath: 'id' });
                    messageStore.createIndex('chatId', 'chatId', { unique: false });
                    messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    /**
     * Create a new project
     */
    async createProject(name, description = '') {
        const project = {
            id: this.generateId('project'),
            name: name,
            description: description,
            icon: '📁', // Default icon
            color: this.getRandomColor(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            documentCount: 0,
            chatCount: 0
        };

        return this.addProject(project);
    }

    /**
     * Add a project to the database
     */
    async addProject(project) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.add(project);

            request.onsuccess = () => resolve(project);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all projects
     */
    async getAllProjects() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => {
                const projects = request.result;
                // Sort by most recently updated
                projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                resolve(projects);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single project by ID
     */
    async getProject(projectId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.get(projectId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update a project
     */
    async updateProject(projectId, updates) {
        const project = await this.getProject(projectId);
        if (!project) {
            throw new Error('Project not found');
        }

        const updatedProject = {
            ...project,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.put(updatedProject);

            request.onsuccess = () => resolve(updatedProject);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a project and all associated data
     */
    async deleteProject(projectId) {
        // Delete project
        const deleteProjectPromise = new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.delete(projectId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        // Delete all documents
        const documents = await this.getProjectDocuments(projectId);
        const deleteDocsPromises = documents.map(doc => this.deleteDocument(doc.id));

        // Delete all chats
        const chats = await this.getProjectChats(projectId);
        const deleteChatPromises = chats.map(chat => this.deletePrivateChat(chat.id));

        await Promise.all([deleteProjectPromise, ...deleteDocsPromises, ...deleteChatPromises]);
        return true;
    }

    /**
     * Add a document to a project
     */
    async addDocument(projectId, name, content, type = 'text/plain') {
        const document = {
            id: this.generateId('doc'),
            projectId: projectId,
            name: name,
            content: content,
            type: type,
            size: new Blob([content]).size,
            createdAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents', 'projects'], 'readwrite');
            const docStore = transaction.objectStore('documents');
            const projectStore = transaction.objectStore('projects');

            const addDocRequest = docStore.add(document);

            addDocRequest.onsuccess = async () => {
                // Update project document count
                const project = await this.getProject(projectId);
                if (project) {
                    project.documentCount = (project.documentCount || 0) + 1;
                    project.updatedAt = new Date().toISOString();
                    projectStore.put(project);
                }
                resolve(document);
            };

            addDocRequest.onerror = () => reject(addDocRequest.error);
        });
    }

    /**
     * Get all documents for a project
     */
    async getProjectDocuments(projectId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readonly');
            const store = transaction.objectStore('documents');
            const index = store.index('projectId');
            const request = index.getAll(projectId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single document
     */
    async getDocument(documentId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readonly');
            const store = transaction.objectStore('documents');
            const request = store.get(documentId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a document
     */
    async deleteDocument(documentId) {
        const document = await this.getDocument(documentId);
        if (!document) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents', 'projects'], 'readwrite');
            const docStore = transaction.objectStore('documents');
            const projectStore = transaction.objectStore('projects');

            const deleteRequest = docStore.delete(documentId);

            deleteRequest.onsuccess = async () => {
                // Update project document count
                const project = await this.getProject(document.projectId);
                if (project && project.documentCount > 0) {
                    project.documentCount -= 1;
                    project.updatedAt = new Date().toISOString();
                    projectStore.put(project);
                }
                resolve();
            };

            deleteRequest.onerror = () => reject(deleteRequest.error);
        });
    }

    /**
     * Create a new private chat in a project
     */
    async createPrivateChat(projectId, title = 'New Private Chat') {
        const chat = {
            id: this.generateId('pchat'),
            projectId: projectId,
            title: title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messageCount: 0
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChats', 'projects'], 'readwrite');
            const chatStore = transaction.objectStore('privateChats');
            const projectStore = transaction.objectStore('projects');

            const addChatRequest = chatStore.add(chat);

            addChatRequest.onsuccess = async () => {
                // Update project chat count
                const project = await this.getProject(projectId);
                if (project) {
                    project.chatCount = (project.chatCount || 0) + 1;
                    project.updatedAt = new Date().toISOString();
                    projectStore.put(project);
                }
                resolve(chat);
            };

            addChatRequest.onerror = () => reject(addChatRequest.error);
        });
    }

    /**
     * Get all chats for a project
     */
    async getProjectChats(projectId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChats'], 'readonly');
            const store = transaction.objectStore('privateChats');
            const index = store.index('projectId');
            const request = index.getAll(projectId);

            request.onsuccess = () => {
                const chats = request.result;
                // Sort by most recent
                chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                resolve(chats);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single private chat
     */
    async getPrivateChat(chatId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChats'], 'readonly');
            const store = transaction.objectStore('privateChats');
            const request = store.get(chatId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update a private chat
     */
    async updatePrivateChat(chatId, updates) {
        const chat = await this.getPrivateChat(chatId);
        if (!chat) {
            throw new Error('Chat not found');
        }

        const updatedChat = {
            ...chat,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChats'], 'readwrite');
            const store = transaction.objectStore('privateChats');
            const request = store.put(updatedChat);

            request.onsuccess = () => resolve(updatedChat);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a private chat and all its messages
     */
    async deletePrivateChat(chatId) {
        // Delete all messages
        const messages = await this.getChatMessages(chatId);
        const deleteMessagePromises = messages.map(msg => 
            new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['privateChatMessages'], 'readwrite');
                const store = transaction.objectStore('privateChatMessages');
                const request = store.delete(msg.id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            })
        );

        await Promise.all(deleteMessagePromises);

        // Get chat to update project count
        const chat = await this.getPrivateChat(chatId);

        // Delete chat
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChats', 'projects'], 'readwrite');
            const chatStore = transaction.objectStore('privateChats');
            const projectStore = transaction.objectStore('projects');

            const deleteRequest = chatStore.delete(chatId);

            deleteRequest.onsuccess = async () => {
                // Update project chat count
                if (chat) {
                    const project = await this.getProject(chat.projectId);
                    if (project && project.chatCount > 0) {
                        project.chatCount -= 1;
                        project.updatedAt = new Date().toISOString();
                        projectStore.put(project);
                    }
                }
                resolve();
            };

            deleteRequest.onerror = () => reject(deleteRequest.error);
        });
    }

    /**
     * Add a message to a private chat
     */
    async addChatMessage(chatId, role, content) {
        const message = {
            id: this.generateId('pmsg'),
            chatId: chatId,
            role: role, // 'user' or 'assistant'
            content: content,
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChatMessages', 'privateChats'], 'readwrite');
            const messageStore = transaction.objectStore('privateChatMessages');
            const chatStore = transaction.objectStore('privateChats');

            const addMessageRequest = messageStore.add(message);

            addMessageRequest.onsuccess = async () => {
                // Update chat
                const chat = await this.getPrivateChat(chatId);
                if (chat) {
                    chat.messageCount = (chat.messageCount || 0) + 1;
                    chat.updatedAt = new Date().toISOString();
                    
                    // Update title from first user message if still default
                    if (chat.title === 'New Private Chat' && role === 'user' && chat.messageCount === 1) {
                        chat.title = this.generateChatTitle(content);
                    }
                    
                    chatStore.put(chat);
                }
                resolve(message);
            };

            addMessageRequest.onerror = () => reject(addMessageRequest.error);
        });
    }

    /**
     * Get all messages for a chat
     */
    async getChatMessages(chatId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['privateChatMessages'], 'readonly');
            const store = transaction.objectStore('privateChatMessages');
            const index = store.index('chatId');
            const request = index.getAll(chatId);

            request.onsuccess = () => {
                const messages = request.result;
                // Sort by timestamp
                messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                resolve(messages);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Search across projects, documents, and chats
     */
    async search(query) {
        const lowerQuery = query.toLowerCase();
        const results = {
            projects: [],
            documents: [],
            chats: []
        };

        // Search projects
        const projects = await this.getAllProjects();
        results.projects = projects.filter(p => 
            p.name.toLowerCase().includes(lowerQuery) ||
            (p.description && p.description.toLowerCase().includes(lowerQuery))
        );

        // Search documents
        const allProjects = await this.getAllProjects();
        for (const project of allProjects) {
            const docs = await this.getProjectDocuments(project.id);
            const matchingDocs = docs.filter(d =>
                d.name.toLowerCase().includes(lowerQuery) ||
                d.content.toLowerCase().includes(lowerQuery)
            );
            results.documents.push(...matchingDocs);
        }

        // Search chats
        for (const project of allProjects) {
            const chats = await this.getProjectChats(project.id);
            const matchingChats = chats.filter(c =>
                c.title.toLowerCase().includes(lowerQuery)
            );
            results.chats.push(...matchingChats);
        }

        return results;
    }

    /**
     * Generate unique ID
     */
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate chat title from first message
     */
    generateChatTitle(content) {
        const maxLength = 50;
        const cleaned = content.trim().replace(/\s+/g, ' ');
        
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        
        return cleaned.substring(0, maxLength) + '...';
    }

    /**
     * Get a random color for project
     */
    getRandomColor() {
        const colors = [
            '#4285f4', '#ea4335', '#fbbc04', '#34a853',
            '#ff6d00', '#9c27b0', '#00bcd4', '#e91e63',
            '#673ab7', '#3f51b5', '#009688', '#8bc34a'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Export project data (for backup)
     */
    async exportProject(projectId) {
        const project = await this.getProject(projectId);
        const documents = await this.getProjectDocuments(projectId);
        const chats = await this.getProjectChats(projectId);
        
        const chatData = [];
        for (const chat of chats) {
            const messages = await this.getChatMessages(chat.id);
            chatData.push({
                ...chat,
                messages: messages
            });
        }

        return {
            project: project,
            documents: documents,
            chats: chatData,
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import project data (from backup)
     */
    async importProject(projectData) {
        // Create project
        const project = await this.addProject({
            ...projectData.project,
            id: this.generateId('project') // Generate new ID
        });

        // Import documents
        for (const doc of projectData.documents) {
            await this.addDocument(project.id, doc.name, doc.content, doc.type);
        }

        // Import chats
        for (const chatData of projectData.chats) {
            const chat = await this.createPrivateChat(project.id, chatData.title);
            
            // Import messages
            for (const msg of chatData.messages) {
                await this.addChatMessage(chat.id, msg.role, msg.content);
            }
        }

        return project;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TorcPrivateStorage;
}
