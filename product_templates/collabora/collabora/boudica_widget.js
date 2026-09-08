/**
 * Boudica Torc Chatbot Widget - Embeddable Version
 * Specifically for the cool.html file built in to Collabora Online
 * https://www.collaboraonline.com/
 * This javascript code is licened under the MIT license and is free to use and modify.
 * https://opensource.org/license/mit
 * 
 * @author: Simon Ian Bain OmniIndex.io X @sibain
 * @email: sibain@omniindex.io
 * Code Maintained by OmniIndex Inc. https://omniindex.io
 * 
 * To use this BOT in your Collabora Online instance, you need to add the following to the
 * top of your cool.html file, just above the closing </head> tag:
 * 
 * <!---Boudica Chat bot -->
 * <script type="text/javascript"  src="boudica_widget.js" defer></script>
 * <script>
 *   window.BoudicaConfig = {
 *    apiEndpoint: 'https://boudi.ca/api/boudica',  // Override API endpoint
 *    position: 'bottom-right',      // bottom-right, bottom-left, top-right, top-left
 *    marginTop: null,               // Override top margin (e.g. '50px', '2rem')
 *    marginBottom: null,            // Override bottom margin (e.g. '30px')
 *    marginLeft: null,              // Override left margin
 *    marginRight: null,             // Override right margin
 *    accentColor: '#B8860B',        // Widget accent color
 *    autoOpen: false                // Auto-open on page load
 *  };
 * </script>
 *
 * The first script tag embeds the javascript code for the Boudica widget, and the second script tag sets up the 
 * configuration for the widget. You can customize the configuration options as needed. You then need to make sure that 
 * the boudica_widget.js file is accessible from the specified path in your Collabora Online instance by copying it in 
 * to the same folder as the cool.html. This will generally be /usr/share/coolwsd/browser/dist/ depending on your installation.
 * 
 */


/** Main entry point for the script  */
(function() {
    'use strict';

    //API bits
    const chatId = 'boudica-bot-' + Date.now();
    let apiKey = '';//getApiKey();
    let userId = '';//getUserId(); 
    getApiKey();

    //Response Array - We keep this so we can insert a response in to the document
    const responsearray = [];
    /** This enables us to have follow-on questions and answers, so we can have a conversation with the bot.
     * The BOT context is a lot smaller than a general chat session, so the bot will remember the context of the conversation.
     */
    var lastSelectedText = '';
    //Follow on insert numbered responses - we keep these so the user can select a numbered response to insert in to the document
    let isInsertMode = false;

    /** Context modes for the "Add File" dropdown selector.
     * Each mode maps to a max_tokens value sent to the backend, which controls how much
     * context (RAG results, document text, conversation history) the request can carry.
     * Chat = quick back-and-forth, minimal context. Summary = enough to digest a whole
     * document/file. Document = maximum, for full document authoring/editing tasks.
     */
    const CONTEXT_MODES = {
        chat: { label: 'Chat Mode', maxTokens: 64000 },
        summary: { label: 'Summary Mode', maxTokens: 128000 },
        document: { label: 'Document Mode', maxTokens: 256000 }
    };
    let contextMode = 'chat';
    /** SVG icon */
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16.793 -48.2693 608.5859375 671.5384908760363"><rect height="21px" width="21px" x="-16.793" y="-48.2693"
         fill="rgba(255, 255, 255, 0)"/> <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="53.207" y="21.7307"
         viewBox="36 27.149993896484375 128.39999389648438 145.65000915527344" xml:space="preserve" height="531.5384908760363" width="468.5859375" style="height: 21px; width: 21px;" preserveAspectRatio="xMinYMin"
         enable-background="new 0 0 200 200" style="overflow: visible;"><path class="st0" d="M100.4,172.8c-1.4,0-2.7-0.3-3.9-1l-56.3-32.3c-2.4-1.4-4-4-4-6.8l-0.2-64.9c0-2.8,1.5-5.5,3.9-6.9l56.1-32.7
            c2.4-1.4,5.5-1.4,7.9,0l56.3,32.3c2.4,1.4,4,4,4,6.8l0.2,64.9c0,2.8-1.5,5.5-3.9,6.9l-56.1,32.7
               C103.1,172.4,101.8,172.8,100.4,172.8z M99.9,30.1c-0.9,0-1.7,0.2-2.5,0.7L41.3,63.4c-1.5,0.9-2.5,2.5-2.4,4.3l0.2,64.9
                  c0,1.8,1,3.4,2.5,4.3l56.3,32.3c1.5,0.9,3.4,0.9,4.9,0l56.1-32.7c1.5-0.9,2.5-2.5,2.4-4.3l-0.2-64.9c0-1.8-1-3.4-2.5-4.3
                     l-56.3-32.3C101.6,30.3,100.7,30.1,99.9,30.1z" style="fill: #b8860b; fill-opacity: 1;"></path><path class="st0" d="M131.7,113.4l-0.1-21.3l-3,1.7l0.1,19.6c0,1.8-0.9,3.4-2.4,4.3l-14.2,8.3v3.5l15.7-9.1
                        C130.2,118.9,131.7,116.2,131.7,113.4z" style="fill: #b8860b; fill-opacity: 1;"></path>
            <path class="st0" d="M119.4,78.1l3-1.7L104,65.9c-2.4-1.4-5.5-1.4-7.9,0L78.6,76.1l3,1.7l15.9-9.3c0.8-0.4,1.6-0.7,2.5-0.7"
             style="fill: #b8860b; fill-opacity: 1;"></path><path class="st0" d="M74.2,117.9c-1.5-0.9-2.5-2.5-2.5-4.3l-0.1-20.2l-3-1.7l0.1,21.9c0,2.8,1.5,5.4,4,6.8l17.5,10V127L74.2,117.9z   "
              style="fill: #b8860b; fill-opacity: 1;"></path><path class="st0" d="M152.7,73.9c0-2.3-1.2-4.4-3.2-5.6l-45.9-26.3c-2-1.1-4.4-1.1-6.4,0L51.5,68.7c-2,1.2-3.2,3.3-3.2,5.6
                 l0.2,52.9c0,2.3,1.2,4.4,3.2,5.6L97.6,159c2,1.1,4.4,1.1,6.4,0l45.7-26.6c2-1.2,3.2-3.3,3.2-5.6L152.7,73.9z M94.2,139.2
                    c0,3.5-2.3,5-5.2,3.4l-25.6-14.5c-2.9-1.6-5.2-5.8-5.2-9.3V87.6c0-3.5,2.3-5,5.2-3.4L89,98.7c2.9,1.6,5.2,5.8,5.2,9.3V139.2z
                        M95.5,90.1L69.6,75.6c-3.1-1.7-3.1-4.6,0-6.3l25.9-14.9c3.1-1.8,8.1-1.8,11.2-0.1l25.8,14.5c3.1,1.7,3.1,4.6,0,6.3L106.6,90
                           C103.5,91.8,98.5,91.8,95.5,90.1z M144.1,118c0,3.5-2.3,7.7-5.2,9.3l-25.6,14.5c-2.9,1.6-5.2,0.1-5.2-3.4v-31.2
                              c0-3.5,2.3-7.7,5.2-9.3l25.6-14.5c2.9-1.6,5.2-0.1,5.2,3.4V118z" style="fill: #b8860b; fill-opacity: 1;"></path></svg></svg>`;

    /** This will get the Boudica API key from local storage */
    function getApiKey() {

            const sessionData = localStorage.getItem('boudica_session');
            const session = JSON.parse(sessionData || '{}');
            apiKey = session.token || '';
            userId = session.email || '';
            if ( apiKey) {
                localStorage.setItem('boudica_api_key', apiKey);
                console.log('[Boudica AutoSignup] API key already exists - skipping signup');
                return;
            } else {
                alert("No Boudica API key found. Please load the Boudica Main App to automatically finish your setup.");
                return;
            }



        // Retrieve the API key from localStorage or prompt the user for it
        // let apiKey = localStorage.getItem('boudica_api_key');
        // if ( !apiKey ) {
        //     apiKey = prompt("Please enter your Boudica API Key:");
        //     localStorage.setItem('boudica_api_key', apiKey);
        // }
        //return apiKey;
    }
    /** This will get the user ID from the local storage */
    function getUserId() {
        // Retrieve the API key from localStorage or prompt the user for it
        let userId = localStorage.getItem('boudica_user_id');
        if ( !userId ) {
            userId = prompt("Please enter your Boudica User ID:");
            localStorage.setItem('boudica_user_id', userId);
        }
        return userId;
    }      

    // Default configuration
    const defaultConfig = {
        apiEndpoint: '/api/boudica',
        position: 'bottom-right',
        marginTop: null,
        marginBottom: null,
        marginLeft: null,
        marginRight: null,
        accentColor: '#B8860B',
        accentColorEnd: '#B8860B',
        autoOpen: false,
        maxTokens: 35000,
        temperature: 0.8,
        topK: 50,
        topP: 0.9,
        requestTimeout: 120000
    };

    // Merge with user config
    const config = Object.assign({}, defaultConfig, window.BoudicaConfig || {});

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        #boudica-widget-container {
            position: fixed;
            ${getPositionStyles(config.position)}
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            z-index: 999999;
            user-select: text;
            -webkit-user-select: text;
        }

        #boudica-chat-button {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${config.accentColor} 0%, ${config.accentColorEnd} 100%);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            position: relative;
        }

        #boudica-chat-button:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }

        #boudica-chat-button svg {
            width: 32px;
            height: 32px;
            fill: white;
        }

        #boudica-notification-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: #ff4757;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 12px;
            font-weight: bold;
            display: none;
            align-items: center;
            justify-content: center;
        }

        #boudica-chat-window {
            position: absolute;
            ${getWindowPositionStyles(config.position)}
            width: 380px;
            height: 550px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            display: none;
            flex-direction: column;
            overflow: hidden;
            animation: slideUp 0.3s ease-out;
        }

        #boudica-chat-window.active {
            display: flex;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        #boudica-chat-header {
            background: linear-gradient(135deg, ${config.accentColor} 0%, ${config.accentColorEnd} 100%);
            color: white;
            padding: 14px 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        #boudica-header-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        #boudica-header-title-text {
            display: flex;
            align-items: baseline;
            gap: 8px;
        }

        #boudica-chat-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }

        #boudica-chat-header .status {
            font-size: 12px;
            opacity: 0.9;
        }

        #boudica-header-toolbar {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: 8px;
        }

        #boudica-close-button {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }

        #boudica-close-button:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #boudica-pii-button {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            margin-right: 8px;
        }

        #boudica-pii-button:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #boudica-add-file-button {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            margin-right: 8px;
        }

        #boudica-add-file-button:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #boudica-context-mode {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            padding: 6px 10px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: background 0.2s;
            margin-right: 8px;
            outline: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
        }

        #boudica-context-mode:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #boudica-context-mode option {
            color: #333;
            background: white;
        }

        #boudica-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f7f9fc;
            scroll-behavior: smooth;
        }

        .boudica-message {
            margin-bottom: 16px;
            display: flex;
            animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .boudica-message.user {
            justify-content: flex-end;
        }

        .boudica-message-content {
            max-width: 75%;
            padding: 12px 16px;
            border-radius: 18px;
            line-height: 1.5;
            font-size: 14px;
            white-space: pre-wrap;
            word-wrap: break-word;
            cursor: text;
            user-select: text;
            -webkit-user-select: text;
        }

        .boudica-message.user .boudica-message-content {
            background: linear-gradient(135deg, ${config.accentColor} 0%, ${config.accentColorEnd} 100%);
            color: white;
            border-bottom-right-radius: 4px;
        }

        .boudica-message.assistant .boudica-message-content {
            background: white;
            color: #333;
            border-bottom-left-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .boudica-message-content h1,
        .boudica-message-content h2,
        .boudica-message-content h3,
        .boudica-message-content h4 {
            margin: 8px 0 4px 0;
            line-height: 1.3;
        }
        .boudica-message-content h1 { font-size: 1.3em; }
        .boudica-message-content h2 { font-size: 1.15em; }
        .boudica-message-content h3 { font-size: 1.05em; }

        .boudica-message-content p {
            margin: 4px 0;
        }

        .boudica-message-content pre {
            background: #1e1e2e;
            color: #cdd6f4;
            padding: 10px 12px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 12px;
            margin: 8px 0;
        }

        .boudica-message-content pre code {
            background: none;
            padding: 0;
            color: inherit;
            font-size: inherit;
        }

        .boudica-message-content code {
            background: #f0f0f0;
            padding: 2px 5px;
            border-radius: 3px;
            font-size: 12px;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }

        .boudica-message-content ul,
        .boudica-message-content ol {
            margin: 4px 0;
            padding-left: 20px;
        }

        .boudica-message-content li {
            margin: 2px 0;
        }

        .boudica-message-content blockquote {
            border-left: 3px solid ${config.accentColor};
            margin: 8px 0;
            padding: 4px 12px;
            color: #555;
        }

        .boudica-message-content a {
            color: ${config.accentColor};
            text-decoration: underline;
        }

        .boudica-message-content table {
            border-collapse: collapse;
            margin: 8px 0;
            font-size: 13px;
            width: 100%;
        }

        .boudica-message-content th,
        .boudica-message-content td {
            border: 1px solid #ddd;
            padding: 4px 8px;
            text-align: left;
        }

        .boudica-message-content th {
            background: #f5f5f5;
            font-weight: 600;
        }

        .boudica-message-content hr {
            border: none;
            border-top: 1px solid #e0e0e0;
            margin: 8px 0;
        }

        .boudica-message.system .boudica-message-content {
            background: #e8eaf6;
            color: #5c6bc0;
            font-size: 13px;
            max-width: 100%;
            text-align: center;
            border-radius: 8px;
        }

        .boudica-typing {
            display: flex;
            gap: 4px;
            padding: 12px 16px;
            background: white;
            border-radius: 18px;
            border-bottom-left-radius: 4px;
            max-width: 75px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .boudica-typing span {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #999;
            animation: bounce 1.4s infinite ease-in-out both;
        }

        .boudica-typing span:nth-child(1) { animation-delay: -0.32s; }
        .boudica-typing span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        #boudica-input-area {
            padding: 16px;
            background: white;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 8px;
            align-items: center;
        }

        #boudica-input {
            flex: 1;
            border: 1px solid #e0e0e0;
            border-radius: 24px;
            padding: 12px 16px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
            font-family: inherit;
            resize: none;
            max-height: 100px;
            overflow-y: auto;
            user-select: text;
            -webkit-user-select: text;
        }

        #boudica-input:focus {
            border-color: ${config.accentColor};
        }

        #boudica-send-button {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, ${config.accentColor} 0%, ${config.accentColorEnd} 100%);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s;
        }

        #boudica-send-button:hover:not(:disabled) {
            transform: scale(1.1);
        }

        #boudica-send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        #boudica-send-button svg {
            width: 20px;
            height: 20px;
            fill: white;
        }

        #boudica-messages::-webkit-scrollbar {
            width: 6px;
        }

        #boudica-messages::-webkit-scrollbar-track {
            background: transparent;
        }

        #boudica-messages::-webkit-scrollbar-thumb {
            background: #cbd5e0;
            border-radius: 3px;
        }

        #boudica-messages::-webkit-scrollbar-thumb:hover {
            background: #a0aec0;
        }

        .boudica-error {
            background: #fee;
            color: #c33;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            margin: 8px 0;
        }

        @media (max-width: 480px) {
            #boudica-chat-window {
                width: calc(100vw - 40px);
                height: calc(100vh - 100px);
                bottom: 80px;
                right: 20px;
                left: 20px;
            }
        }
    `;
    document.head.appendChild(style);

    // Helper functions for positioning
    function cssVal(v) {
        if (!v) return null;
        // Auto-append 'px' if value is a plain number
        return /^\d+(\.\d+)?$/.test(String(v)) ? v + 'px' : String(v);
    }

    function getPositionStyles(position) {
        // If explicit margins are set, use them directly
        const mt = cssVal(config.marginTop);
        const mb = cssVal(config.marginBottom);
        const ml = cssVal(config.marginLeft);
        const mr = cssVal(config.marginRight);

        if (mt || mb || ml || mr) {
            let css = '';
            if (mt) css += `top: ${mt} !important; `;
            if (mb) css += `bottom: ${mb} !important; `;
            if (ml) css += `left: ${ml} !important; `;
            if (mr) css += `right: ${mr} !important; `;
            console.log('[Boudica Widget] Position override:', css);
            return css;
        }

        // Otherwise use preset positions with 20px default offsets
        const positions = {
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'top-right': 'top: 20px; right: 20px;',
            'top-left': 'top: 20px; left: 20px;'
        };
        return positions[position] || positions['bottom-right'];
    }

    function getWindowPositionStyles(position) {
        const isTop = (config.marginTop && !config.marginBottom) ||
                      position.startsWith('top');
        const isLeft = (config.marginLeft && !config.marginRight) ||
                       position.includes('left');

        let vertical = isTop ? 'top: 80px;' : 'bottom: 80px;';
        let horizontal = isLeft ? 'left: 0;' : 'right: 0;';
        return `${vertical} ${horizontal}`;
    }

    // Create HTML structure
    const widgetHTML = `
        <div id="boudica-widget-container">
            <button id="boudica-chat-button" aria-label="Open Boudica Assistant">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.68-.31-3.85-.85l-.28-.14-2.85.48.48-2.85-.14-.28C4.31 14.68 4 13.38 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
                <circle cx="9" cy="12" r="1"/>
                    <circle cx="12" cy="12" r="1"/>
                    <circle cx="15" cy="12" r="1"/>
                </svg>
                <span id="boudica-notification-badge">1</span>
            </button>
            <div id="boudica-chat-window">
                <div id="boudica-chat-header">
                    <div id="boudica-header-title">
                        <div id="boudica-header-title-text">
                            <h3>Boudica</h3>
                            <span class="status">Your AI Assistant</span>
                        </div>
                        <button id="boudica-close-button" aria-label="Close chat" title="Close Chat">×</button>
                    </div>
                    <div id="boudica-header-toolbar">
                        <select id="boudica-context-mode" aria-label="Context mode" title="Choose how much context Boudica uses for this task">
                            <option value="chat">Chat Mode</option>
                            <option value="summary">Summary Mode</option>
                            <option value="document">Document Mode</option>
                        </select>
                        <button id="boudica-add-file-button" aria-label="Add File" title="Add file context for Boudica">Add File</button>
                        <button id="boudica-pii-button" aria-label="PII Data" title="Check file for PII Data">PII Data</button>
                    </div>
                </div>
                <div id="boudica-messages">
                    <div class="boudica-message system">
                        <div class="boudica-message-content">
                            Welcome! I'm Boudica, your AI assistant. How can I help you today?
                        </div>
                    </div>
                </div>
                <div id="boudica-input-area">
                    <textarea 
                        id="boudica-input" 
                        placeholder="Type your message..." 
                        rows="1"
                        aria-label="Message input"
                    ></textarea>
                    <button id="boudica-send-button" aria-label="Send message">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Wait for DOM to be ready
    function initWidget() {
        const container = document.createElement('div');
        container.innerHTML = widgetHTML;
        document.body.appendChild(container.firstElementChild);

        // Get elements
        const elements = {
            widget: document.getElementById('boudica-widget-container'),
            chatButton: document.getElementById('boudica-chat-button'),
            chatWindow: document.getElementById('boudica-chat-window'),
            closeButton: document.getElementById('boudica-close-button'),
            addFileButton: document.getElementById('boudica-add-file-button'),
            piiButton: document.getElementById('boudica-pii-button'),
            contextModeSelect: document.getElementById('boudica-context-mode'),
            messages: document.getElementById('boudica-messages'),
            input: document.getElementById('boudica-input'),
            sendButton: document.getElementById('boudica-send-button'),
            notificationBadge: document.getElementById('boudica-notification-badge')
        };

        // State
        let isOpen = false;
        let isProcessing = false;
        let processingWatchdogTimer = null; // last-resort UI-recovery timer -- see setProcessing()
        let queuedFiles = [];  // Store files to be sent with next message

        // Persistent session ID for this widget instance (per browser tab)
        const sessionId = (function() {
            const key = 'boudica_widget_session_id';
            let id = sessionStorage.getItem(key);
            if (!id) {
                id = 'widget-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
                sessionStorage.setItem(key, id);
            }
            return id;
        })();

        // Event listeners
        elements.chatButton.addEventListener('click', toggleChat);
        elements.closeButton.addEventListener('click', toggleChat);
        elements.sendButton.addEventListener('click', sendMessage);
        elements.addFileButton.addEventListener('click', handleAddFileClick);
        elements.piiButton.addEventListener('click', handlePIIDataClick);
        elements.contextModeSelect.value = contextMode;
        elements.contextModeSelect.addEventListener('change', (e) => {
            contextMode = CONTEXT_MODES[e.target.value] ? e.target.value : 'chat';
            addMessage(`Context set to **${CONTEXT_MODES[contextMode].label}** (${CONTEXT_MODES[contextMode].maxTokens.toLocaleString()} tokens).`, 'system');
        });
        elements.input.addEventListener('keydown', handleInputKeydown);
        elements.input.addEventListener('input', autoResizeTextarea);
        ['copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup'].forEach((eventName) => {
            elements.widget.addEventListener(eventName, keepWidgetSelectionEvent);
        });
        elements.input.addEventListener('keydown', keepWidgetClipboardShortcut, true);
        elements.messages.addEventListener('keydown', keepWidgetClipboardShortcut, true);

        // Functions
        function toggleChat() {
            isOpen = !isOpen;
            elements.chatWindow.classList.toggle('active', isOpen);
            
            if (isOpen) {
                elements.input.focus();
                elements.notificationBadge.style.display = 'none';
            }
        }

        function handleAddFileClick() {
            // Open file picker to select files to add to the prompt
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;  // Allow selecting multiple files
            input.accept = '.txt,.pdf,.docx,.doc,.xlsx,.xls,.csv,.pptx,.ppt,.odt,.ods,.odp,.json,.xml,.html,.md,.log';
            
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                
                // Add files to queue
                files.forEach(file => {
                    // Check for duplicates
                    if (!queuedFiles.some(f => f.name === file.name && f.size === file.size)) {
                        queuedFiles.push(file);
                    }
                });
                
                // Display queued files in chat
                displayQueuedFiles();
            });
            
            input.click();
        }
        
        function displayQueuedFiles() {
            if (queuedFiles.length === 0) return;
            
            let message = '**Files added to context:**\n';
            queuedFiles.forEach((file, index) => {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                message += `${index + 1}. ${file.name} (${sizeMB} MB)\n`;
            });
            message += `\nThese files will be sent with your next message.`;
            
            addMessage(message, 'system');
        }
        
        function clearQueuedFiles() {
            queuedFiles = [];
        }

        function handlePIIDataClick() {
            // Scan document for PII data: Zip codes, Post codes, SSN, NI Numbers, Bank accounts, and Credit card numbers
            setProcessing(true);
            
            // Create a streaming bubble to show progress
            const assistantBubble = createStreamingBubble();
            updateStreamingBubble(assistantBubble, 'Scanning document for PII data...');
            
            // Get document details to determine format
            const details = getDocumentDetails();
            
            // Get document text based on format
            let docTextPromise;
            if (details.documentName.includes('.xlsx') || details.documentName.includes('.xls') || 
                details.documentName.includes('.csv') || details.documentName.includes('.xlsm') || 
                details.documentName.includes('.ods')) {
                docTextPromise = downloadDocumentAsText('csv').then(text => text.replace(/,/g, ' '));
            } else if (details.documentName.includes('.docx') || details.documentName.includes('.doc') || 
                       details.documentName.includes('.odt')) {
                docTextPromise = downloadDocumentAsText('txt');
            } else if (details.documentName.includes('.pptx') || details.documentName.includes('.ppt') || 
                       details.documentName.includes('.odp') || details.documentName.includes('.otp')) {
                docTextPromise = downloadDocumentAsText('fodp').then(text => {
                    const tagRegex = /<[^>]+>/g;
                    return text.replace(tagRegex, '');
                });
            } else {
                docTextPromise = getFullDocumentText().then(result => result.content);
            }
            
            docTextPromise.then((docText) => {
                // Define PII patterns
                const piiPatterns = {
                    'Zip Codes': /\b\d{5}(?:-\d{4})?\b/g,
                    'Bank Accounts': /\b\d{8,16}\b/g,
                    'SSNs': /\b\d{3}-\d{2}-\d{4}\b/g,
                    'NI Numbers': /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/g,
                    'Credit Card Numbers': /\b\d{4}(?:[- ]?\d{4}){2,4}\b/g,
                    'Email Addresses': /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g
                };
                
                // Count occurrences of each pattern
                const foundPII = {};
                const firstMatches = {};
                for (const [name, pattern] of Object.entries(piiPatterns)) {
                    const matches = docText.match(pattern);
                    if (matches && matches.length > 0) {
                        foundPII[name] = matches.length;
                        firstMatches[name] = matches[0];
                    }
                }
                
                // Highlight the first occurrence of each found pattern type
                for (const [name, match] of Object.entries(firstMatches)) {
                    try {
                        app.searchService.highlightAll(match);
                    } catch (e) {
                        console.warn(`Could not highlight ${name}:`, e);
                    }
                }
                
                // Build message
                let message = '';
                let totalFound = 0;
                
                if (Object.keys(foundPII).length === 0) {
                    message = 'No PII data detected in the document.';
                } else {
                    message = '**PII Data Found:**\n';
                    for (const [name, count] of Object.entries(foundPII)) {
                        message += `- ${name}: ${count}\n`;
                        totalFound += count;
                    }
                    message += `\n**Total: ${totalFound} potential PII items found**\n\nOccurrences have been highlighted in the document.`;
                }
                
                updateStreamingBubble(assistantBubble, message);
                setProcessing(false);
                elements.input.focus();
            }).catch((err) => {
                updateStreamingBubble(assistantBubble, `Error scanning for PII: ${err.message}`);
                console.error('PII scan error:', err);
                setProcessing(false);
                elements.input.focus();
            });
        }

        function autoResizeTextarea() {
            elements.input.style.height = 'auto';
            elements.input.style.height = Math.min(elements.input.scrollHeight, 100) + 'px';
        }

        function handleInputKeydown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        }

        function keepWidgetSelectionEvent(e) {
            e.stopPropagation();
        }

        function keepWidgetClipboardShortcut(e) {
            if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) {
                e.stopPropagation();
            }
        }


        function extractFindTerm(message) {
            // Quoted text is unambiguous — always wins
            const quoted = message.match(/["']([^"']+)["']/);
            if (quoted) return quoted[1].trim();

            // Jump to the first "find" and drop it
            const idx = message.search(/\bfind\b/i);
            if (idx === -1) return null;
            let rest = message.slice(idx).replace(/^find\s+/i, '');

            // Filler phrases that can appear (alone or combined) between "find" and
            // the actual term. Stripped iteratively since order/combination varies:
            // "find and highlight the word X" -> strips "and highlight", then "the word"
            const fillerPatterns = [
                /^(?:and\s+)?highlight\s+/i,
                /^and\s+find\s+/i,
                /^search\s+for\s+/i,
                /^look\s+for\s+/i,
                /^(?:the|teh)\s+word\s+/i,
                /^(?:the|teh)\s+phrase\s+/i,
                /^please\s+/i,
                /^(?:can|could)\s+you\s+/i
            ];

            let changed = true;
            while (changed) {
                changed = false;
                for (const pattern of fillerPatterns) {
                    if (pattern.test(rest)) {
                        rest = rest.replace(pattern, '');
                        changed = true;
                    }
                }
                // "in the/teh doc(ument)" as a PREFIX (e.g. "in teh doc three")
                var inDocPrefix = /\s+that\s+is\s+in\s+(?:the|teh|this)\s+doc(?:ument)?\.?\s*$/i;
                if (inDocPrefix.test(rest)) {
                    rest = rest.replace(inDocPrefix, '');
                    changed = true;
                } 
     
                inDocPrefix = /\s+that's\s+in\s+(?:the|teh|this)\s+doc(?:ument)?\.?\s*$/i;
                if (inDocPrefix.test(rest)) {
                    rest = rest.replace(inDocPrefix, '');
                    changed = true;
                }  

                 // "in the/teh doc(ument)" as a PREFIX (e.g. "in teh doc three")
                inDocPrefix = /^in\s+(?:the|teh|this)\s+doc(?:ument)?\s+/i;
                if (inDocPrefix.test(rest)) {
                    rest = rest.replace(inDocPrefix, '');
                    changed = true;
                }
            }

            rest = rest.replace(/\s+that\s+is\s+in\s+(?:the|teh|this)\s+doc(?:ument)?\.?\s*$/i, '');
            rest = rest.replace(/\s+that's\s+in\s+(?:the|teh|this)\s+doc(?:ument)?\.?\s*$/i, '');
            // Existing simple suffix — also widened to accept "this", not just "the"/"teh"
            rest = rest.replace(/\s+in\s+(?:the|teh|this)\s+doc(?:ument)?\.?\s*$/i, '');

              rest = rest.trim().replace(/[.?!]+$/, '');
            return rest || null;
        }//end extractFindTerm


        async function sendMessage() {
            let message = elements.input.value.trim();
            if (!message && queuedFiles.length === 0) return;
            if (isProcessing) return;

            // Check if user wants to cancel queued file upload
            const cancelKeywords = /^(stop|cancel)$/i;
            if (cancelKeywords.test(message) && queuedFiles.length > 0) {
                const count = queuedFiles.length;
                addMessage(`Cancelled file upload. Cleared ${count} queued file(s).`, 'system');
                clearQueuedFiles();
                elements.input.value = '';
                elements.input.style.height = 'auto';
                elements.input.focus();
                return;
            }

            if (message) {
                addMessage(message, 'user');
            }
            elements.input.value = '';
            elements.input.style.height = 'auto';
            setProcessing(true);

            // Create a streaming assistant bubble
            const assistantBubble = createStreamingBubble();
            
            // If files are queued, send them with the message
            if (queuedFiles.length > 0) {
                try {
                    // Same create/write-a-document detection used further below --
                    // must run here too, otherwise queued attachments always take
                    // this early-return path and the editor insert logic (which
                    // lives later in this function) never runs.
                    const createRegex = /\b(create|compose|write)\s+?.*?(document|spreadsheet|presentation|whitepaper|post)\b/gi;
                    const shouldUpdateDocument = createRegex.test(message);

                    let responseText = '';
                    await callBoudicaAPI(
                        message || 'Please analyze the provided files.',
                        (partialText) => {
                            responseText = partialText;
                            updateStreamingBubble(assistantBubble, partialText, shouldUpdateDocument);
                        },
                        queuedFiles  // Pass queued files
                    );
                    responseText = stripReasoningPreamble(responseText);
                    responseText = stripBackendStopNotice(responseText);
                    if ( responseText.toLocaleLowerCase().includes("final answer:") ) {
                        responseText = responseText.slice(responseText.toLocaleLowerCase().indexOf("final answer:") + 13);
                    }
                    if ( responseText.toLocaleLowerCase().includes("final translation:") ) {
                        responseText = responseText.slice(responseText.toLocaleLowerCase().indexOf("final translation:") + 16);
                    }
                    responsearray.push(responseText);
                    if (shouldUpdateDocument) {
                        commitDocumentContent(responseText);
                    }
                    clearQueuedFiles();
                    setProcessing(false);
                    elements.input.focus();
                    return;
                } catch (error) {
                    assistantBubble.remove();
                    addErrorMessage(error.message);
                    console.error('Boudica API Error with files:', error);
                    setProcessing(false);
                    elements.input.focus();
                    return;
                }
            }

            // --- Insert-mode short-circuit: user is picking a numbered response to insert ---
            if (isInsertMode) {
                try {
                    const responseIndex = parseInt(message[1], 10) - 1;
                    if (responseIndex >= 0 && responseIndex < responsearray.length) {
                        insertTextAtCursor(responsearray[responseIndex]);
                        addMessage("Inserted response into the document.", 'system');
                    } else {
                        addMessage(`I cannot find that response.`, 'system');
                    }
                } catch (error) {
                    addMessage(`I cannot find that response.`, 'system');
                    console.error('Insert-mode error:', error);
                } finally {
                    isInsertMode = false;
                    setProcessing(false);
                    elements.input.focus();
                }
                return;
            }

            //Is this a find and replace request? If so we need to handle it differently as we need to get the selected text and then replace it with the new text.
            const findRegex = /\bfind\b/i;
            if (findRegex.test(message)) {
                const searchTerm = extractFindTerm(message);
                if (searchTerm) {
                    app.searchService.highlightAll(searchTerm);
                    updateStreamingBubble(assistantBubble, `Highlighted all occurrences of "${searchTerm}" in the document.`);
                } else {
                    updateStreamingBubble(assistantBubble, `What would you like me to find? You can also wrap it in quotes, e.g. find "budget forecast".`);
                }
                setProcessing(false);
                elements.input.focus();
                return;
            }
            //End find and replace request
            let boudicaCalled = false;
            try {
                /** Is teh user asking us to insert a previous response in to teh document? If so which one. */
                let insertResponse = false;
                //const insert_regex = /\b(insert)\s+?.*?(response|answer)\b/gi;
                //const insert_matches = message.match(insert_regex);
                const insertRegex = /\b(insert)\s+?.*?(response|answer)\b/gi;
                if (insertRegex.test(message)) {
                    const insertThisRegex = /\b(insert)\s+?.*?(this)\s+?.*?(response|answer)\b/gi;
                    if (insertThisRegex.test(message)) {
                        updateStreamingBubble(assistantBubble, "I will insert this response in to your document");
                        insertResponse = true;
                        message = message.replace(insertThisRegex, '');
                    } else {
                        const lower = message.toLowerCase();
                        if (lower.includes('first response') || lower.includes('first answer')) {
                            insertTextAtCursor(responsearray[0]);
                            updateStreamingBubble(assistantBubble, `The document has been updated with the first response`);
                        } else if (lower.includes('last response') || lower.includes('last answer') || lower.includes('this ')) {
                            insertTextAtCursor(responsearray[responsearray.length - 1]);
                            updateStreamingBubble(assistantBubble, `I have updated the document with the last response`);
                        } else {
                            updateStreamingBubble(assistantBubble, `Please type the response number you want to insert. Between 0 and ${responsearray.length - 1}. The last response in this chat session.`);
                            isInsertMode = true;
                        }
                        setProcessing(false);
                        elements.input.focus();
                        return;
                    }
                }
                /** Is teh user asking about teh document contents? */
                const createRegex = /\b(create|compose|write)\s+?.*?(document|spreadsheet|presentation|whitepaper|post)\b/gi;
                if ( createRegex.test(message) ) {
                    let responseText = '';
                    await callBoudicaAPI(message, (partialText) => {
                        responseText = partialText; 
                        updateStreamingBubble(assistantBubble, partialText, true);
                    }, queuedFiles.length > 0 ? queuedFiles : null);
                    responseText = stripReasoningPreamble(responseText);
                    boudicaCalled = true; 
                    //OK we need to strip the reasoning from this response as it is not useful to the user and will just confuse them. We can do this by looking for the channel markers and stripping them out.
                    responseText = stripBackendStopNotice(responseText);
                    if ( responseText.toLocaleLowerCase().includes("final answer:") ) {
                        responseText = responseText.slice(responseText.toLocaleLowerCase().indexOf("final answer:") + 13);
                    }
                    if ( responseText.toLocaleLowerCase().includes("final translation:") ) {
                        responseText = responseText.slice(responseText.toLocaleLowerCase().indexOf("final translation:") + 16);
                    }                                    
                    responsearray.push(responseText); 
                    // This is the ONLY write to the editor for this response --
                    // see commitDocumentContent()'s comment for why streaming
                    // writes were removed entirely rather than throttled.
                    commitDocumentContent(responseText);
                    clearQueuedFiles();
                    setProcessing(false);
                    elements.input.focus();                 
                } else {
                    const regex = /\b(the|teh|this|have|here is)\s+?.*?(section|paragraph|para|selection|selected|highlighted|selection)\b/gi;
                    const matches = message.match(regex);
                    if ( !matches ) {
                        const regex = /\b(the|teh|this)\s+?.*?document\b/gi;
                        const matches = message.match(regex);
                        const details = getDocumentDetails();
                        var selectedText = '';
                        if ( matches ) {
                            // Prepare files to send - include both queued files AND current document
                            let filesToSend = [];
                            
                            // First, add any queued files
                            if (queuedFiles.length > 0) {
                                filesToSend.push(...queuedFiles);
                            }
                            
                            // Always add the current document for context
                            if ( details.documentName.includes('.xlsx') || details.documentName.includes('.xls') || details.documentName.includes('.csv') || details.documentName.includes('.xlsm') || details.documentName.includes('.ods') ) {
                                selectedText = await downloadDocumentAsText('csv');
                                //Remove teh commas as they just add to teh word count :-)
                                selectedText = selectedText.replace(/,/g, ' ');
                            } else if ( details.documentName.includes('.docx') || details.documentName.includes('.doc') || details.documentName.includes('.odt') ) {
                                selectedText = await downloadDocumentAsText('txt');
                            } else if ( details.documentName.includes('.pptx') || details.documentName.includes('.ppt') || details.documentName.includes('.odp') || details.documentName.includes('.otp') ) {
                                selectedText = await downloadDocumentAsText('fodp');
                                //So now we need to clean this up
                                const tagRegex = /<[^>]+>/g;
                                const cleanedText = selectedText.replace(tagRegex, '');
                                selectedText = cleanedText;
                            } else {
                                selectedText = await getFullDocumentText('txt');
                            }
                            selectedText = clearBoudicaCommands(selectedText);
                            lastSelectedText = selectedText;
                            
                            // Convert current document text to File object and add to send list
                            const docFile = createDocumentFile(selectedText, details.documentName);
                            filesToSend.push(docFile);
                            
                            let responseText = '';
                            await callBoudicaAPI(message, (partialText) => {
                                responseText = partialText;
                                updateStreamingBubble(assistantBubble, partialText);
                            }, filesToSend); 
                            responseText = stripReasoningPreamble(responseText);
                            boudicaCalled = true; 
                            //OK we need to strip the reasoning from this response as it is not useful to the user and will just confuse them. We can do this by looking for the channel markers and stripping them out.
                            if ( responseText.toLocaleLowerCase().includes("final answer:") ) {
                                responseText = responseText.slice(responseText.toLocaleLowerCase().indexOf("final answer:") + 13);
                            }
                            if ( responseText.toLocaleLowerCase().includes("final translation:") ) {
                                responseText = responseText.slice(responseText.toLocaleLowerCase().indexOf("final translation:") + 16);
                            }                                    
                            responsearray.push(responseText); 
                            if ( insertResponse ) {
                                insertTextAtCursor(responseText);
                            }
                            clearQueuedFiles();                   
                        }
                    } else {
                        var selectedText = await fetchSelectedText();
                        selectedText = clearBoudicaCommands(selectedText);
                        lastSelectedText = selectedText;

                        // Instead of appending the selected/highlighted text directly to
                        // the prompt (which pollutes the inference context), write it out
                        // to a temp text file and upload it alongside any queued files,
                        // the same way the whole-document case does.
                        let filesToSend = [];
                        if (queuedFiles.length > 0) {
                            filesToSend.push(...queuedFiles);
                        }
                        const details = getDocumentDetails();
                        const selectionFile = createDocumentFile(selectedText, details.documentName, 'selection');
                        filesToSend.push(selectionFile);

                        let responseText = '';
                        await callBoudicaAPI(message, (partialText) => {
                            responseText = partialText;
                            updateStreamingBubble(assistantBubble, partialText);
                        }, filesToSend);
                        boudicaCalled = true;  
                        responseText = stripReasoningPreamble(responseText);
                        responsearray.push(responseText);  
                        if ( insertResponse ) {
                            insertTextAtCursor(responseText);
                        }
                        clearQueuedFiles();
                    }
                }
                if (!boudicaCalled) {
                    let responseText = '';
                    message+= `. Context Text: ${lastSelectedText}`;
                    await callBoudicaAPI(message, (partialText) => {
                        responseText = partialText;
                        updateStreamingBubble(assistantBubble, partialText);
                    }, queuedFiles.length > 0 ? queuedFiles : null);  // Pass queued files if any
                    boudicaCalled = true; 
                    responseText = stripReasoningPreamble(responseText);
                    responsearray.push(responseText);
                    if ( insertResponse ) {
                        insertTextAtCursor(responseText);
                    }
                    clearQueuedFiles();  // Clear queued files after sending
                }
            } catch (error) {
                assistantBubble.remove();
                addErrorMessage(error.message);
                console.error('Boudica API Error:', error);
            } finally {
                setProcessing(false);
                elements.input.focus();
            }
        }//end sendMessage     

        // Create an empty assistant bubble that will be filled as tokens stream in
        function createStreamingBubble() {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'boudica-message assistant';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'boudica-message-content';
            contentDiv.innerHTML = '<span class="boudica-typing"><span></span><span></span><span></span></span>';
            messageDiv.appendChild(contentDiv);
            elements.messages.appendChild(messageDiv);
            elements.messages.scrollTop = elements.messages.scrollHeight;

            // Total silence for the first ~15s of a slow request reads as "did
            // this even register" -- only fires if the bubble is STILL showing
            // nothing but the typing indicator by then; updateStreamingBubble()
            // clears it the moment any real content (or "Composing document…"
            // progress) actually arrives. Purely informational -- setProcessing()'s
            // watchdog is what actually guarantees recovery if nothing ever comes.
            messageDiv._slowHintTimer = setTimeout(() => {
                messageDiv._slowHintTimer = null;
                if (!messageDiv.isConnected) return;
                const el = messageDiv.querySelector('.boudica-message-content');
                if (el && el.querySelector('.boudica-typing')) {
                    el.innerHTML = '<span class="boudica-typing"><span></span><span></span><span></span></span> Still working… this is taking longer than usual.';
                }
            }, 15000);

            return messageDiv;
        }

        // Update streaming bubble. During document-creation requests, the
        // editor itself is intentionally NOT touched here -- see
        // commitDocumentContent() for why repeated full-document repaste on
        // every streamed token is unsafe. This just shows progress in chat.
        function updateStreamingBubble(messageDiv, text, updateDocument = false) {
            if (messageDiv._slowHintTimer) {
                clearTimeout(messageDiv._slowHintTimer);
                messageDiv._slowHintTimer = null;
            }
            const contentDiv = messageDiv.querySelector('.boudica-message-content');
            if (!contentDiv) {
                return;
            }
            if ( updateDocument ) {
                const charCount = text ? text.length : 0;
                contentDiv.innerHTML = `Composing document… (${charCount} characters so far)`;
                elements.messages.scrollTop = elements.messages.scrollHeight;
            } else {
                contentDiv.innerHTML = renderMarkdown(text);
                elements.messages.scrollTop = elements.messages.scrollHeight;
            }
        }

        function addMessage(content, role) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `boudica-message ${role}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'boudica-message-content';
            contentDiv.textContent = content;
            
            messageDiv.appendChild(contentDiv);
            elements.messages.appendChild(messageDiv);
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }

        function showTypingIndicator() {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'boudica-message assistant';
            
            const typingDiv = document.createElement('div');
            typingDiv.className = 'boudica-typing';
            typingDiv.innerHTML = '<span></span><span></span><span></span>';
            
            messageDiv.appendChild(typingDiv);
            elements.messages.appendChild(messageDiv);
            elements.messages.scrollTop = elements.messages.scrollHeight;
            
            return messageDiv;
        }

        function addErrorMessage(errorText) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'boudica-message system';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'boudica-message-content';
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'boudica-error';
            errorDiv.textContent = `Error: ${errorText}`;
            
            contentDiv.appendChild(errorDiv);
            messageDiv.appendChild(contentDiv);
            elements.messages.appendChild(messageDiv);
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }

        function setProcessing(processing) {
            isProcessing = processing;
            elements.sendButton.disabled = processing;
            elements.input.disabled = processing;

            if (processingWatchdogTimer) {
                clearTimeout(processingWatchdogTimer);
                processingWatchdogTimer = null;
            }

            if (processing) {
                // Last-resort UI recovery, independent of the AbortController/
                // requestTimeout chain in callBoudicaAPI(). That chain only
                // unsticks the UI if the underlying fetch actually settles
                // (resolves or rejects) -- observed in practice that some VPN
                // configurations interfere with file-attachment requests in a
                // way that never cleanly does either, leaving Send and the
                // input box disabled indefinitely with zero feedback and no
                // way back short of reloading the page. Fires a bit after the
                // app's own request timeout so that timeout's own (more
                // specific) error message gets first chance to run -- this is
                // strictly a backstop for when it doesn't.
                processingWatchdogTimer = setTimeout(() => {
                    processingWatchdogTimer = null;
                    console.warn('[Boudica] Processing watchdog fired -- forcing UI recovery after a request that never completed or failed cleanly.');
                    isProcessing = false;
                    elements.sendButton.disabled = false;
                    elements.input.disabled = false;
                    addErrorMessage(
                        "That request stalled and didn't complete or fail normally — the chat is usable again now. " +
                        "If you're on a VPN, this can happen with file attachments specifically; try again with the VPN " +
                        "(or its threat-protection/ad-blocking features) temporarily disabled."
                    );
                }, config.requestTimeout + 10000);
            }
        }

        // Auto-open if configured
        if (config.autoOpen) {
            setTimeout(toggleChat, 1000);
        }

        console.log('Boudica AI Assistant widget initialized');
    }//end initWidget

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
        //const overviewPanel = createDocumentOverviewPanel({ refreshIntervalMinutes: 1 });
    }

    // Expose API for external control
    window.BoudicaWidget = {
        open: function() {
            const btn = document.getElementById('boudica-chat-button');
            if (btn && !document.getElementById('boudica-chat-window').classList.contains('active')) {
                btn.click();
            }
        },
        close: function() {
            const btn = document.getElementById('boudica-close-button');
            if (btn && document.getElementById('boudica-chat-window').classList.contains('active')) {
                btn.click();
            }
        }
    };

    /** Document specific helper functions */

    function fetchSelectedText(timeoutMs = 5000) {
        const mimetype = app.map.getDocType() === "spreadsheet"
            ? "application/x-libreoffice-markdown-annotated"
            : "text/markdown;charset=utf-8";

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                app.map.off("textselectioncontent", onContent);
                app.map.off("complexselection", onComplex);
            };
            const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Selection fetch timeout"));
            }, timeoutMs);

            const onContent = (msg) => {
                const raw = msg.msg || "";
                if (!raw.startsWith("textselectioncontent:")) return;
                cleanup();
                const body = raw.substring(21);
                try {
                    if (body.startsWith("{")) {
                    resolve(JSON.parse(body)[mimetype] || "");
                    } else {
                    resolve(body);
                    }
                } catch {
                    reject(new Error("Failed to parse selection content"));
                }
            };

            const onComplex = () => {
                cleanup();
            reject(new Error("complexselection"));
            };

            app.map.on("textselectioncontent", onContent);
            app.map.on("complexselection", onComplex);
            app.socket.sendMessage("gettextselection mimetype=" + mimetype);
        });
    }


    function downloadDocumentAsText(format = "txt", timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const previousFlag = app.map.wopi.DownloadAsPostMessage;
            app.map.wopi.DownloadAsPostMessage = true;

            const cleanup = () => {
                app.map.wopi.DownloadAsPostMessage = previousFlag;
                app.map.off("postMessage", onMessage);
                 clearTimeout(timer);
            };

            const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Download timeout"));
        }, timeoutMs);

        const onMessage = (msg) => {
            if (msg.msgId !== "Download_As") return;
            cleanup();
            fetch(msg.args.URL, { credentials: "include" })
                .then(r => {
                  if (!r.ok) throw new Error("Download fetch failed: " + r.status);
                     return r.text();
                })
                .then(resolve, reject);
            };

            app.map.on("postMessage", onMessage);
            try {
                app.map.downloadAs("boudica-export." + format, format, "", "export");
            } catch (err) {
                try {
                    app.map.downloadAs("boudica-export." + 'csv', 'csv', "", "export");
                } catch (err) {
                    app.map.downloadAs("boudica-export." + 'txt', 'txt', "", "export");
                }
            }
        });
    }///end downloadDocumentAsText

    /** This function will ckear all Boudica commands from teh promot making sure that they do not get in teh way of teh response
     * @param text
     * @return text
     */
    function clearBoudicaCommands(text) {
        text = text.replace(/log:/gi, ' ');
        text = text.replace(/no memory/gi, ' ');
        text = text.replace(/use rag/gi, ' ');
        text = text.replace(/no rag/gi, ' ');
        text = text.replace(/create connection/gi, ' ');
        text = text.replace(/pdf/gi, 'p_d_f');
        text = text.replace(/docx/gi, 'c_o_c_x');
        text = text.replace(/xslt/gi, 'x_s_lt');
        text = text.replace(/pptx/gi, 'p_p_tx');
        text = text.replace(/auth/gi, ' ');
        text = text.replace(/access/gi, ' ');
        text = text.replace(/login/gi, 'l_o_g_in');
        text = text.replace(/use/gi, ' ');
        text = text.replace(/using/gi, 'us_in_g');
        text = text.replace(/email/gi, 'e_mail');
        text = text.replace(/connection/gi, 'co_nnecti_on');
        text = text.replace(/calander/gi, 'ca_lan_der');
        text = text.replace(/create/gi, 'cr_eat_e');
        text = text.replace(/file/gi, 'f_i_l_e');
        text = text.replace(/document/gi, 'do_c_um_ent');
        return text;
    }//end clearBoudicaCommands

    /** This function will get all of the content from the selected document
     * @returns {Promise<string>} - A promise that resolves to the full document text.
     */
    async function getFullDocumentText() {
        app.map.sendUnoCommand(".uno:SelectAll");
        // Give the kit process a moment to register the new selection
        // before requesting its content
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
            const result = await fetchSelectionTrying([
            "text/markdown;charset=utf-8",
            "text/html",
            "text/plain;charset=utf-8"
            ]);
            console.log("Succeeded with mimetype:", result.mimetype);
            console.log("Content:", result.content);
            return result;
        } catch (err) {
            console.warn("All mimetypes failed:", err.message);
            throw err;
        }
    }

    async function fetchSelectionTrying(mimetypes, timeoutMs = 5000) {
        let lastErr;
        for (const mt of mimetypes) {
            try {
            return { mimetype: mt, content: await fetchSelectionAsMimetype(mt, timeoutMs) };
            } catch (err) {
                lastErr = err;
                if (err.message !== "complexselection") throw err; // only fall through on this specific error
            }
        }
        throw lastErr;
    }    


    function fetchSelectionAsMimetype(mimetype, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                app.map.off("textselectioncontent", onContent);
                app.map.off("complexselection", onComplex);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error("Selection fetch timeout"));
            }, timeoutMs);

            const onContent = (msg) => {
                const raw = msg.msg || "";
                if (!raw.startsWith("textselectioncontent:")) return;
                cleanup();
                const body = raw.substring(21);
                try {
                    if (body.startsWith("{")) {
                        // Multiple mimetypes were requested (comma-separated) — response
                        // is a JSON object keyed by mimetype string
                        const parsed = JSON.parse(body);
                        resolve(parsed[mimetype] ?? Object.values(parsed)[0] ?? "");
                    } else {
                        // Single mimetype requested — raw content comes back directly
                        resolve(body);
                    }
                } catch {
                    reject(new Error("Failed to parse selection content"));
                }
            };

            const onComplex = () => {
                cleanup();
                reject(new Error("complexselection"));
            };

            app.map.on("textselectioncontent", onContent);
            app.map.on("complexselection", onComplex);
            app.socket.sendMessage("gettextselection mimetype=" + mimetype);
        });
    }
    
    /** This is an insert text helper function. It will insert teh given text in to the poingt at where the curor is.
     * @param {string} text - The text to insert at the current cursor position.
     */
    function insertTextAtCursor(text) {
        const header = "paste mimetype=text/markdown;charset=utf-8\n";
        app.socket.sendMessage(new Blob([header, text]));
        app.map.fire("editorgotfocus");
        app.map.focus();
    }

    /**
     * The ONE write to the document for a create/write-a-document request.
     * Deliberately not called during streaming -- see updateStreamingBubble,
     * which only updates the chat bubble while tokens are arriving. Doing a
     * full SelectAll + repaste of the whole growing document on every
     * streamed token was found to be unsafe: each repaste gets more
     * expensive as the document grows, Collabora can fall behind the
     * client's update rate, and under that backpressure the LAST (and most
     * important -- the complete, final) paste is exactly the one most
     * likely to be dropped or overtaken. A single atomic write after the
     * full, cleaned response is ready avoids that whole failure mode.
     */
    function commitDocumentContent(text) {
        if (!text || !text.trim()) {
            console.warn('[Boudica] Skipped final document write -- cleaned response was empty. Nothing was changed in the editor.');
            return;
        }
        app.socket.sendMessage("uno .uno:SelectAll");
        insertTextAtCursor(renderMarkdown(text));
    }

    function findInDocument(searchTerm) {
        app.searchService.highlightAll(searchTerm);
    }


    /**
     * Convert document text to a File object
     * Handles different document formats and determines appropriate filename
     */
    function createDocumentFile(docText, documentName, suffix = 'full') {
        // Remove extension and use as base name
        const baseName = documentName.replace(/\.[^/.]+$/, '');
        const fileName = `${baseName}_${suffix}.txt`;
        
        // Create a File object from the text content
        const blob = new Blob([docText], { type: 'text/plain' });
        return new File([blob], fileName, { type: 'text/plain' });
    }

    async function callBoudicaAPI(message, onStream, files = null) {
        message = 'No Memory. ' + message;
        const baseUrl = (config.apiEndpoint || '/api/boudica').replace(/\/$/, '');
        let url = baseUrl + '/chat';
        if ( !apiKey ) {
            // getApiKey() sets the outer apiKey/userId as a side effect and
            // always returns undefined - assigning its return value here
            // would immediately clobber whatever it just set.
            getApiKey();
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);

        try {
            let response;
            
            // If files are provided, use FormData for multipart upload
            if (files && files.length > 0) {
                const formData = new FormData();
                formData.append('message', message);
                formData.append('session_id', chatId);
                formData.append('user_id', userId);
                formData.append('user_email', userId);
                formData.append('stream', 'true');
                formData.append('api_key', apiKey);
                formData.append('temperature', config.temperature ?? 0.8);
                formData.append('max_tokens', CONTEXT_MODES[contextMode]?.maxTokens ?? config.maxTokens ?? 49000);
                formData.append('use_rag', 'true');
                formData.append('inference_type', 'document_writer');
                
                // Append files
                files.forEach((file, index) => {
                    formData.append(`document_${index}`, file);
                    formData.append(`filename_${index}`, file.name);
                });
                formData.append('document_count', files.length.toString());
                
                console.log(`Calling API with ${files.length} file(s) via multipart`);

                response = await fetch(url, {
                    method: 'POST',
                    // The server can't safely scan a multipart body for
                    // api_key the way it does for JSON (a naive scan there
                    // previously corrupted it on Content-Disposition
                    // headers), so it doesn't try - it relies on this
                    // Authorization header instead, same as every other
                    // working caller (see chat-api.js's _authHeaders()).
                    // Without it, every file-attach request was rejected as
                    // unauthenticated even with a valid api_key in the form
                    // data. Confirmed live 2026-09-05.
                    headers: apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {},
                    body: formData,
                    signal: controller.signal
                });
            } else {
                // Original JSON-based flow for text-only messages
                const requestBody = {
                    prompt: message,
                    message: message,
                    session_id: chatId,
                    user_id: userId,
                    user_email: userId,
                    stream: true,
                    api_key: apiKey,
                    temperature: config.temperature ?? 0.8,
                    max_tokens: CONTEXT_MODES[contextMode]?.maxTokens ?? config.maxTokens ?? 35000,
                    use_rag: true
                };
                console.log("Message Body:", requestBody);
                
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
            }
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
                throw new Error(errData.error || `API error ${response.status}`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.error) throw new Error(chunk.error);
                        if (chunk.type === 'start') continue;
                        if (chunk.type === 'token') {
                            fullContent += chunk.token;
                            onStream(stripChannelMarkers(fullContent));
                        }
                        if (chunk.response !== undefined && chunk.response !== '') {
                            fullContent = chunk.response;
                            onStream(stripChannelMarkers(fullContent));
                        }
                    } catch (e) {
                        // Previously this swallowed EVERY JSON.parse failure with
                        // no trace, so a malformed mid-stream line just vanished.
                        // Surface it -- it's diagnosable now instead of invisible.
                        if (e.message && !e.message.includes('JSON')) {
                            throw e;
                        }
                        console.warn('[Boudica] Skipped unparseable stream line:', line, e);
                    }
                }
            }

            // Flush any bytes the decoder held back waiting for the rest of a
            // multi-byte character (e.g. an emoji) that never arrived because
            // the stream closed. Without this final non-streaming decode call,
            // those trailing bytes are silently discarded by TextDecoder.
            buffer += decoder.decode();

            // Flush any remaining buffer content
            if (buffer.trim()) {
                try {
                    const chunk = JSON.parse(buffer);
                    if (chunk.error) throw new Error(chunk.error);
                    if (chunk.response !== undefined && chunk.response !== '') {
                        onStream(stripChannelMarkers(chunk.response));
                    } else if (chunk.type === 'token' && chunk.token) {
                        fullContent += chunk.token;
                        onStream(stripChannelMarkers(fullContent));
                    }
                } catch (e) {
                    // This is the case that most likely explains truncated endings:
                    // the server closed the connection before finishing the last
                    // NDJSON line, so it's not valid JSON and can't be recovered
                    // client-side. Previously silent -- now at least visible in
                    // devtools so it's distinguishable from "model finished early".
                    console.warn('[Boudica] Final stream chunk was incomplete and could not be parsed -- response may be truncated. Raw tail:', buffer, e);
                    if (e.message && !e.message.includes('JSON')) {
                        throw e;
                    }
                }
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('Request timeout – please try again');
            throw error;
        }
    }//end callBoudicaAPI


    function stripChannelMarkers(text) {
        let result = text.replace(/<\|channel>thought/g, '');
        result = result.replace(/<channel\|>/g, '');
        return result;
    }        

    // Simple Markdown to HTML renderer with XSS protection
    function renderMarkdown(text) {
        // HTML-escape first to prevent XSS
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Code blocks (``` ... ```)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
            return '<pre><code>' + code.trim() + '</code></pre>';
        });
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headings
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Horizontal rule
        html = html.replace(/^---$/gm, '<hr>');

        // Bold and italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
         // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Unordered lists
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

        // Ordered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((<li>.*<\/li>\n?)+)/g, function(match) {
            if (match.includes('<ul>')) return match;
            return '<ol style="list-style-type: decimal; left: 6px;">' + match + '</ol>';
        });

        // Links [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Line breaks (double newline = paragraph, single = <br>)
        html = html.replace(/�/g, '&nbsp;');
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        html = '<p>' + html + '</p>';
       // Clean up empty paragraphs and fix nesting
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>(<h[1-4]>)/g, '$1');
        html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
        html = html.replace(/<p>(<pre>)/g, '$1');
        html = html.replace(/(<\/pre>)<\/p>/g, '$1');
        html = html.replace(/<p>(<ul>)/g, '$1');
        html = html.replace(/(<\/ul>)<\/p>/g, '$1');
        html = html.replace(/<p>(<ol>)/g, '$1');
        html = html.replace(/(<\/ol>)<\/p>/g, '$1');
        html = html.replace(/<p>(<blockquote>)/g, '$1');
        html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
        html = html.replace(/<p><hr><\/p>/g, '<hr>');
        html = html.replace(/<p><hr>/g, '<hr><p>');

        return html;
    }  //end renderMarkdown      

    // Strips reasoning/preamble text before known "final answer" style markers.
    function stripReasoningPreamble(text) {
        const markers = ["final answer:", "final translation:"];
        const lower = text.toLocaleLowerCase();
        for (const marker of markers) {
            const idx = lower.indexOf(marker);
            if (idx !== -1) return text.slice(idx + marker.length);
        }
        return text;
    } 

    // The backend can cut generation short and append an inline notice like
    // "(Response stopped: repetition loop detected)" as if it were part of
    // the content itself. Strip it so it doesn't end up pasted into the
    // document or shown as if it were part of the generated text.
    function stripBackendStopNotice(text) {
        return text.replace(/\(Response stopped:[^)]*\)\s*\*?\s*$/i, '').trimEnd();
    }


    /** The overview Panel  */
    async function createDocumentOverviewPanel({
        refreshIntervalMinutes = 1,
        position = { bottom: '80px', left: '20px' }
    } = {}) {

        const panel = document.createElement('div');
        panel.id = 'boudica-overview-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: ${position.bottom}; left: ${position.left};
            width: 280px;
            max-height: 400px;
            background: #fff;
                border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            font-family: sans-serif;
            font-size: 13px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        panel.innerHTML = `
            <div id="boudica-overview-header" style="
                display:flex; justify-content:space-between; align-items:center;
                padding:8px 10px; background:#0082C9; color:#fff; cursor:pointer;
                user-select:none;">
                <span style="height:36px; width: 36px;">${icon}</span>
                <span>Document Overview</span>
                <div>
                    <button id="boudica-overview-refresh" title="Refresh now" style="
                        background:none; border:none; color:#fff; cursor:pointer; font-size:13px; margin-right:6px;">⟳</button>
                    <button id="boudica-overview-toggle" title="Minimize" style="
                        background:none; border:none; color:#fff; cursor:pointer; font-size:13px;">─</button>
                </div>
            </div>
            <div id="boudica-overview-body" style="
                padding:10px; overflow-y:auto; flex:1; white-space:pre-wrap; line-height:1.4;">
                <em></em>
            </div>
        `;

        document.body.appendChild(panel);

        const body = panel.querySelector('#boudica-overview-body');
        const header = panel.querySelector('#boudica-overview-header');
        const toggleBtn = panel.querySelector('#boudica-overview-toggle');
        const refreshBtn = panel.querySelector('#boudica-overview-refresh');

        let minimized = false;
        function setMinimized(state) {
            minimized = state;
            body.style.display = minimized ? 'none' : 'block';
            toggleBtn.textContent = minimized ? '▢' : '─';
            toggleBtn.title = minimized ? 'Restore' : 'Minimize';
            panel.style.maxHeight = minimized ? 'unset' : '400px';
        }

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setMinimized(!minimized);
        });
        // Clicking the header (not just the button) also toggles — convenient for a small panel
        header.addEventListener('click', () => setMinimized(!minimized));
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refresh();
        });

        let refreshing = false;
        let destroyed = false;

        async function refresh() {
            //if (refreshing || destroyed) return; // don't overlap refreshes
            refreshing = true;
            const previousContent = body.textContent;

            const details = getDocumentDetails();
            var docText = '';
            try {
                if ( details.documentName.includes('.xlsx') || details.documentName.includes('.xls') || details.documentName.includes('.csv') || details.documentName.includes('.xlsm') || details.documentName.includes('.ods') ) {
                    docText = await downloadDocumentAsText('csv');
                    //Remove teh commas as they just add to teh word count :-)
                    docText = docText.replace(/,/g, ' ');
                } else if ( details.documentName.includes('.docx') || details.documentName.includes('.doc') || details.documentName.includes('.odt') ) {
                    docText = await downloadDocumentAsText('txt');
                } else if ( details.documentName.includes('.pptx') || details.documentName.includes('.ppt') || details.documentName.includes('.odp') || details.documentName.includes('.otp') ) {
                    docText = await downloadDocumentAsText('fodp');
                    //So now we need to clean this up
                    const tagRegex = /<[^>]+>/g;
                    const cleanedText = docText.replace(tagRegex, '');
                    docText = cleanedText;
                } else {
                    docText = await getFullDocumentText('txt');
                }

      
                if (!docText || !docText.trim()) {
                    body.textContent = '';
                //return;
                }   

                // Boudica has a few system bits that call various app (agents) so will disable them here
                docText = clearBoudicaCommands(docText);

                const addressCount = `**This document contains:**\n- Zip Codes: ${countOccurrences(docText, /\b\d{5}(?:-\d{4})?\b/g)}\n- Bank Accounts: ${countOccurrences(docText, /\b\d{8,16}\b/g)}\n- SSNs: ${countOccurrences(docText, /\b\d{3}-\d{2}-\d{4}\b/g)}\n- NI Numbers: ${countOccurrences(docText, /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/g)}\n- Credit Card Numbers: ${countOccurrences(docText, /\b\d{4}(?:[- ]?\d{4}){2,4}\b/g)}\n- Email Addresses: ${countOccurrences(docText, /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g)}`;

                let summary = '';

                summary = `**Document:** ${details.documentName}\n**Title:** ${details.documentTitle}\n**Last Saved:** ${details.lastSavedDate ? details.lastSavedDate.toLocaleString() : 'Unknown'}\n---\n\n**Summary:**\n${addressCount && addressCount !== '' ? addressCount + '' : 'Refreshing ...'}
                \n---\nWord Count: ${docText.split(/\s+/).filter(Boolean).length}\nCharacter Count: ${docText.length}`;
                summary = renderMarkdown(summary);
                if (!destroyed) {
                    body.innerHTML = summary || '';
                }
            } catch (err) {
                console.warn('Overview refresh failed:', err);
                if (!destroyed) {
                    body.innerHTML = previousContent && previousContent !== ''
                    ? previousContent + ''
                    : '⚠️ Could not generate an overview.';
                }
            } finally {
            refreshing = false;
        }
    }//end refresh

  //refresh(); // initial load
  //const intervalId = setInterval(refresh, refreshIntervalMinutes * 120 * 1000);

  // Clean teardown if you ever need to remove the panel programmatically
  function destroy() {
    destroyed = true;
    //clearInterval(intervalId);
    panel.remove();
  }

  return { panel, refresh, destroy, setMinimized };
}

function countOccurrences(text, regex) {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
}

function getDocumentDetails() {
  const wopi = app.map.wopi;

  // 1) Document Name — the actual filename, e.g. "MyReport.docx"
  const documentName = wopi.BaseFileName;

  // 2) Document Title — the breadcrumb/display name shown in the editor's title area
  //    (usually the same as BaseFileName, but this is the field the UI itself reads)
  const documentTitle = wopi.BreadcrumbDocName;

  // 3) Last Saved time/date
  //    app.map._lastmodtime is the raw ISO-ish string from the server
  //    (format uses a comma before fractional/timezone info, per the .replace(/,.*/,"Z") seen in source)
  const rawLastModTime = app.map._lastmodtime;
  const lastSavedDate = rawLastModTime
    ? new Date(rawLastModTime.replace(/,.*/, "Z"))
    : null;

  return {
    documentName,
    documentTitle,
    lastSavedDate,           // JS Date object, or null if not yet available
    lastSavedRaw: rawLastModTime
  };
}

})();