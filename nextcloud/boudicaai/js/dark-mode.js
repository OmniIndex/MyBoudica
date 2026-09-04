/**
 * Dark Mode & High Contrast Toggle Handler
 * Manages theme switching and accessibility modes with persistence
 */

(function() {
    'use strict';

    // Check for saved preferences or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light';
    const highContrastEnabled = localStorage.getItem('highContrast') === 'true';
    
    // Initialize theme immediately to avoid flash
    if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        if (document.body) {
            document.body.classList.add('dark-mode');
        }
    }
    
    if (highContrastEnabled) {
        document.documentElement.classList.add('high-contrast');
        if (document.body) {
            document.body.classList.add('high-contrast');
        }
    }

    // Update syntax highlighting theme
    function updateHighlightTheme(isDark) {
        const highlightTheme = document.getElementById('highlightTheme');
        if (highlightTheme) {
            highlightTheme.href = isDark 
                ? 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css'
                : 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
        }
    }

    // Toggle dark mode
    function toggleDarkMode() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        
        // Update syntax highlighting theme
        updateHighlightTheme(isDarkMode);
        
        // Save preference to localStorage
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        
        // Update toggle state
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.checked = isDarkMode;
        }
        
        // Dispatch custom event for other scripts to react to theme change
        window.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: isDarkMode ? 'dark' : 'light' }
        }));
    }

    // Toggle high contrast mode
    function toggleHighContrast() {
        const isHighContrast = document.body.classList.toggle('high-contrast');
        
        // Save preference to localStorage
        localStorage.setItem('highContrast', isHighContrast ? 'true' : 'false');
        
        // Update button visual state
        const highContrastBtn = document.getElementById('highContrastBtn');
        if (highContrastBtn) {
            if (isHighContrast) {
                // highContrastBtn.style.backgroundColor = 'var(--primary-color)';
                // highContrastBtn.style.color = 'white';
            } else {
                // highContrastBtn.style.backgroundColor = '';
                // highContrastBtn.style.color = '';
            }
        }
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('contrastChanged', {
            detail: { highContrast: isHighContrast }
        }));
    }

    // Set up event listeners when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        const darkModeToggle = document.getElementById('darkModeToggle');
        const highContrastBtn = document.getElementById('highContrastBtn');
        
        // Initialize dark mode toggle state
        if (darkModeToggle) {
            darkModeToggle.checked = currentTheme === 'dark';
            darkModeToggle.addEventListener('change', toggleDarkMode);
        }
        
        // Initialize high contrast button state
        if (highContrastBtn) {
            if (highContrastEnabled) {
                // highContrastBtn.style.backgroundColor = 'var(--primary-color)';
                // highContrastBtn.style.color = 'white';
            }
            highContrastBtn.addEventListener('click', toggleHighContrast);
        }
        
        // Initialize highlight theme
        updateHighlightTheme(currentTheme === 'dark');
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Ctrl+Shift+D or Cmd+Shift+D for dark mode
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                toggleDarkMode();
            }
            // Ctrl+Shift+H or Cmd+Shift+H for high contrast
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                toggleHighContrast();
            }
        });
    });

    // Detect system theme preference changes
    if (window.matchMedia) {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Only auto-switch if user hasn't set a preference
        darkModeQuery.addEventListener('change', function(e) {
            if (!localStorage.getItem('theme')) {
                const isDark = e.matches;
                if (isDark) {
                    document.body.classList.add('dark-mode');
                    updateHighlightTheme(true);
                    const darkModeToggle = document.getElementById('darkModeToggle');
                    if (darkModeToggle) darkModeToggle.checked = true;
                } else {
                    document.body.classList.remove('dark-mode');
                    updateHighlightTheme(false);
                    const darkModeToggle = document.getElementById('darkModeToggle');
                    if (darkModeToggle) darkModeToggle.checked = false;
                }
            }
        });
        
        // Detect system high contrast preference
        const highContrastQuery = window.matchMedia('(prefers-contrast: high)');
        highContrastQuery.addEventListener('change', function(e) {
            if (!localStorage.getItem('highContrast')) {
                if (e.matches) {
                    document.body.classList.add('high-contrast');
                    const highContrastBtn = document.getElementById('highContrastBtn');
                    if (highContrastBtn) {
                        // highContrastBtn.style.backgroundColor = 'var(--primary-color)';
                        // highContrastBtn.style.color = 'white';
                    }
                } else {
                    document.body.classList.remove('high-contrast');
                    const highContrastBtn = document.getElementById('highContrastBtn');
                    if (highContrastBtn) {
                        // highContrastBtn.style.backgroundColor = '';
                        // highContrastBtn.style.color = '';
                    }
                }
            }
        });
    }

})();
