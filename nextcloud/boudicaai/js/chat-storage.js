/**
 * Chat Storage Module
 * Handles local storage of chat history and conversations
 */

class ChatStorage {
    constructor() {
        this.maxChats = 100; // Maximum number of chats to store
        this.settingsChangeListener = null;
        this._userId = '';
        this._updateKeys();
    }

    /**
     * Set the current user ID so that all localStorage keys are namespaced
     * per user. Call this immediately after authentication succeeds so that
     * users sharing a browser do not see each other's chats or settings.
     *
     * @param {string} userId - Unique user identifier (e.g. email address).
     */
    setUserId(userId) {
        // Allow letters, digits and common email / identifier characters.
        // Anything else is replaced with '_' to keep keys safe.
        this._userId = userId ? String(userId).replace(/[^a-zA-Z0-9@._+-]/g, '_') : '';
        this._updateKeys();
    }

    /** Recompute all localStorage key names from the current user prefix. */
    _updateKeys() {
        const prefix = this._userId ? this._userId + ':' : '';
        this.storageKey            = prefix + 'boudica_chats';
        this.currentChatKey        = prefix + 'boudica_current_chat';
        this.foldersKey            = prefix + 'boudica_folders';
        this.rulesKey              = prefix + 'boudica_rules';
        this.scheduledActionsKey   = prefix + 'boudica_scheduled_actions';
    }

    setSettingsChangeListener(listener) {
        this.settingsChangeListener = listener;
    }

    notifySettingsChanged(reason = 'unknown') {
        if (typeof this.settingsChangeListener !== 'function') {
            return;
        }

        try {
            this.settingsChangeListener(this.getUserSettingsSnapshot(), reason);
        } catch (error) {
            console.warn('Settings change listener failed:', error);
        }
    }

    getUserSettingsSnapshot() {
        return {
            actions: this.getScheduledActions(),
            folders: this.getAllFolders(),
            chats: this.getAllChats(),
            current_chat_id: this.getCurrentChatId(),
            rules: this.getRules()
        };
    }

    /**
     * Get all chats from localStorage
     */
    getAllChats() {
        try {
            const chatsData = localStorage.getItem(this.storageKey);
            if (chatsData) {
                return JSON.parse(chatsData);
            }
        } catch (error) {
            console.error('Error loading chats:', error);
        }
        return [];
    }

    /**
     * Get a specific chat by ID
     */
    getChat(chatId) {
        const chats = this.getAllChats();
        return chats.find(chat => chat.id === chatId);
    }

    /**
     * Save a chat
     */
    saveChat(chat) {
        try {
            let chats = this.getAllChats();
            
            // Check if chat exists
            const existingIndex = chats.findIndex(c => c.id === chat.id);
            
            if (existingIndex !== -1) {
                // Update existing chat
                chats[existingIndex] = {
                    ...chats[existingIndex],
                    ...chat,
                    updatedAt: new Date().toISOString()
                };
            } else {
                // Add new chat
                chat.createdAt = new Date().toISOString();
                chat.updatedAt = chat.createdAt;
                chats.unshift(chat); // Add to beginning
                
                // Limit number of stored chats
                if (chats.length > this.maxChats) {
                    chats = chats.slice(0, this.maxChats);
                }
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(chats));
            this.notifySettingsChanged('chat_saved');
            return true;
        } catch (error) {
            console.error('Error saving chat:', error);
            return false;
        }
    }

    /**
     * Delete a chat
     */
    deleteChat(chatId) {
        try {
            let chats = this.getAllChats();
            chats = chats.filter(chat => chat.id !== chatId);
            localStorage.setItem(this.storageKey, JSON.stringify(chats));
            this.notifySettingsChanged('chat_deleted');
            return true;
        } catch (error) {
            console.error('Error deleting chat:', error);
            return false;
        }
    }

    /**
     * Create a new chat
     */
    createNewChat(title = 'OmniIndex Boudica Chat', folderId = null) {
        const chat = {
            id: this.generateChatId(),
            title: title,
            messages: [],
            folderId: folderId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.saveChat(chat);
        return chat;
    }

    /**
     * Add a message to a chat
     */
    addMessage(chatId, message) {
        const chat = this.getChat(chatId);
        if (chat) {
            message.id = this.generateMessageId();
            message.timestamp = new Date().toISOString();
            // Initialize audit_id if not present
            if (!message.hasOwnProperty('audit_id')) {
                message.audit_id = null;
            }
            chat.messages.push(message);
            
            // Update chat title from first user message if still default
            if ((chat.title === 'New Conversation' || chat.title === 'OmniIndex Boudica Chat') && message.role === 'user' && chat.messages.length === 1) {
                chat.title = this.generateChatTitle(message.content);
            }
            
            this.saveChat(chat);
            return message;
        }
        return null;
    }

    /**
     * Update a message in a chat
     */
    updateMessage(chatId, messageId, updates) {
        const chat = this.getChat(chatId);
        if (chat) {
            const messageIndex = chat.messages.findIndex(m => m.id === messageId);
            if (messageIndex !== -1) {
                chat.messages[messageIndex] = {
                    ...chat.messages[messageIndex],
                    ...updates
                };
                this.saveChat(chat);
                return chat.messages[messageIndex];
            }
        }
        return null;
    }

    /**
     * Get current chat ID
     */
    getCurrentChatId() {
        return localStorage.getItem(this.currentChatKey);
    }

    /**
     * Set current chat ID
     */
    setCurrentChatId(chatId) {
        localStorage.setItem(this.currentChatKey, chatId);
        this.notifySettingsChanged('current_chat_changed');
    }

    /**
     * Clear current chat ID
     */
    clearCurrentChatId() {
        localStorage.removeItem(this.currentChatKey);
        this.notifySettingsChanged('current_chat_cleared');
    }

    /**
     * Search chats
     */
    searchChats(query) {
        const chats = this.getAllChats();
        const lowerQuery = query.toLowerCase();
        
        return chats.filter(chat => {
            // Search in title
            if (chat.title.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            // Search in messages
            return chat.messages.some(msg => 
                msg.content.toLowerCase().includes(lowerQuery)
            );
        });
    }

    /**
     * Generate unique chat ID
     */
    generateChatId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate chat title from first message
     */
    generateChatTitle(content) {
        // Take first 50 characters or until first newline
        let title = content.split('\n')[0].substring(0, 50);
        if (content.length > 50) {
            title += '...';
        }
        return title;
    }

    // ========== FOLDER MANAGEMENT ==========

    /**
     * Get all folders
     */
    getAllFolders() {
        try {
            const foldersData = localStorage.getItem(this.foldersKey);
            if (foldersData) {
                return JSON.parse(foldersData);
            }
        } catch (error) {
            console.error('Error loading folders:', error);
        }
        return [];
    }

    /**
     * Get a specific folder by ID
     */
    getFolder(folderId) {
        const folders = this.getAllFolders();
        return folders.find(folder => folder.id === folderId);
    }

    /**
     * Create a new folder
     */
    createFolder(name, parentId = null) {
        try {
            const folders = this.getAllFolders();
            
            const folder = {
                id: this.generateFolderId(),
                name: name,
                parentId: parentId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            folders.push(folder);
            localStorage.setItem(this.foldersKey, JSON.stringify(folders));
            this.notifySettingsChanged('folder_created');
            return folder;
        } catch (error) {
            console.error('Error creating folder:', error);
            return null;
        }
    }

    /**
     * Update folder
     */
    updateFolder(folderId, updates) {
        try {
            const folders = this.getAllFolders();
            const folderIndex = folders.findIndex(f => f.id === folderId);
            
            if (folderIndex !== -1) {
                folders[folderIndex] = {
                    ...folders[folderIndex],
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem(this.foldersKey, JSON.stringify(folders));
                this.notifySettingsChanged('folder_updated');
                return folders[folderIndex];
            }
        } catch (error) {
            console.error('Error updating folder:', error);
        }
        return null;
    }

    /**
     * Delete folder and optionally move chats
     */
    deleteFolder(folderId, moveChatsToFolder = null) {
        try {
            const folders = this.getAllFolders();
            const chats = this.getAllChats();
            
            // Find all child folders recursively
            const childFolderIds = this.getChildFolderIds(folderId);
            childFolderIds.push(folderId);
            
            // Update chats in deleted folders
            chats.forEach(chat => {
                if (childFolderIds.includes(chat.folderId)) {
                    chat.folderId = moveChatsToFolder;
                    chat.updatedAt = new Date().toISOString();
                }
            });
            
            // Remove folders
            const updatedFolders = folders.filter(f => !childFolderIds.includes(f.id));
            
            localStorage.setItem(this.foldersKey, JSON.stringify(updatedFolders));
            localStorage.setItem(this.storageKey, JSON.stringify(chats));
            this.notifySettingsChanged('folder_deleted');
            return true;
        } catch (error) {
            console.error('Error deleting folder:', error);
            return false;
        }
    }

    /**
     * Get all child folder IDs recursively
     */
    getChildFolderIds(folderId) {
        const folders = this.getAllFolders();
        const childIds = [];
        
        const findChildren = (parentId) => {
            folders.forEach(folder => {
                if (folder.parentId === parentId) {
                    childIds.push(folder.id);
                    findChildren(folder.id); // Recursive
                }
            });
        };
        
        findChildren(folderId);
        return childIds;
    }

    /**
     * Move chat to folder
     */
    moveChatToFolder(chatId, folderId) {
        const chat = this.getChat(chatId);
        if (chat) {
            chat.folderId = folderId;
            chat.updatedAt = new Date().toISOString();
            return this.saveChat(chat);
        }
        return false;
    }

    /**
     * Get chats in a folder
     */
    getChatsInFolder(folderId) {
        const chats = this.getAllChats();
        return chats.filter(chat => chat.folderId === folderId);
    }

    /**
     * Get folder hierarchy (nested structure)
     */
    getFolderHierarchy() {
        const folders = this.getAllFolders();
        const rootFolders = folders.filter(f => !f.parentId);
        
        const buildTree = (parentId) => {
            return folders
                .filter(f => f.parentId === parentId)
                .map(folder => ({
                    ...folder,
                    children: buildTree(folder.id)
                }));
        };
        
        return rootFolders.map(folder => ({
            ...folder,
            children: buildTree(folder.id)
        }));
    }

    /**
     * Generate unique folder ID
     */
    generateFolderId() {
        return 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Clear all chats
     */
    clearAllChats() {
        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.currentChatKey);
            return true;
        } catch (error) {
            console.error('Error clearing chats:', error);
            return false;
        }
    }

    /**
     * Export chats as JSON
     */
    exportChats() {
        const chats = this.getAllChats();
        return JSON.stringify(chats, null, 2);
    }

    /**
     * Import chats from JSON
     */
    importChats(jsonData) {
        try {
            const chats = JSON.parse(jsonData);
            if (Array.isArray(chats)) {
                localStorage.setItem(this.storageKey, JSON.stringify(chats));
                return true;
            }
        } catch (error) {
            console.error('Error importing chats:', error);
        }
        return false;
    }

    /**
     * Get all scheduled actions
     */
    getScheduledActions() {
        try {
            const actionsData = localStorage.getItem(this.scheduledActionsKey);
            if (actionsData) {
                return JSON.parse(actionsData);
            }
        } catch (error) {
            console.error('Error loading scheduled actions:', error);
        }
        return [];
    }

    /**
     * Get a specific scheduled action by ID
     */
    getScheduledAction(actionId) {
        const actions = this.getScheduledActions();
        return actions.find(action => action.id === actionId);
    }

    /**
     * Save a scheduled action
     */
    saveScheduledAction(action) {
        try {
            let actions = this.getScheduledActions();
            actions.push(action);
            localStorage.setItem(this.scheduledActionsKey, JSON.stringify(actions));
            this.notifySettingsChanged('action_saved');
            return action;
        } catch (error) {
            console.error('Error saving scheduled action:', error);
            return null;
        }
    }

    /**
     * Update a scheduled action
     */
    updateScheduledAction(action) {
        try {
            let actions = this.getScheduledActions();
            const index = actions.findIndex(a => a.id === action.id);
            if (index !== -1) {
                actions[index] = action;
                localStorage.setItem(this.scheduledActionsKey, JSON.stringify(actions));
                this.notifySettingsChanged('action_updated');
                return true;
            }
        } catch (error) {
            console.error('Error updating scheduled action:', error);
        }
        return false;
    }

    /**
     * Delete a scheduled action
     */
    deleteScheduledAction(actionId) {
        try {
            let actions = this.getScheduledActions();
            actions = actions.filter(action => action.id !== actionId);
            localStorage.setItem(this.scheduledActionsKey, JSON.stringify(actions));
            this.notifySettingsChanged('action_deleted');
            return true;
        } catch (error) {
            console.error('Error deleting scheduled action:', error);
            return false;
        }
    }

    // ========== RULES MANAGEMENT ==========

    /**
     * Get all rules
     */
    getRules() {
        try {
            const data = localStorage.getItem(this.rulesKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error loading rules:', e);
            return [];
        }
    }

    /**
     * Save (create or update) a rule
     */
    saveRule(rule) {
        try {
            const rules = this.getRules();
            const idx = rules.findIndex(r => r.id === rule.id);
            if (idx !== -1) {
                rules[idx] = { ...rules[idx], ...rule, updatedAt: new Date().toISOString() };
            } else {
                rule.createdAt = new Date().toISOString();
                rule.updatedAt = rule.createdAt;
                rules.push(rule);
            }
            localStorage.setItem(this.rulesKey, JSON.stringify(rules));
            this.notifySettingsChanged('rule_saved');
            return rule;
        } catch (e) {
            console.error('Error saving rule:', e);
            return null;
        }
    }

    /**
     * Delete a rule
     */
    deleteRule(ruleId) {
        try {
            const rules = this.getRules().filter(r => r.id !== ruleId);
            localStorage.setItem(this.rulesKey, JSON.stringify(rules));
            this.notifySettingsChanged('rule_deleted');
            return true;
        } catch (e) {
            console.error('Error deleting rule:', e);
            return false;
        }
    }

    /**
     * Generate unique rule ID
     */
    generateRuleId() {
        return 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Export for use in other modules
window.ChatStorage = ChatStorage;
