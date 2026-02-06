// content_whatsapp.js

function triggerSend() {
    // Attempt to find the Send button using multiple robust selectors
    
    // Selector 1: The standard icon span used by WhatsApp
    const icon = document.querySelector('span[data-icon="send"]');
    if (icon) {
        const btn = icon.closest('button');
        if (btn) {
            btn.click();
            return true;
        }
    }
    
    // Selector 2: Accessibility label fallback
    const ariaBtn = document.querySelector('button[aria-label="Send"]');
    if (ariaBtn) {
        ariaBtn.click();
        return true;
    }
    
    return false;
}

function waitForSendButtonAndClick() {
    // Only run if the specific URL parameters from our app are present
    const params = new URLSearchParams(window.location.search);
    if (!params.has('phone') || !params.has('text')) return;

    console.log("Yash Automator: Detected message request. Waiting for Send button...");

    let attempts = 0;
    const maxAttempts = 60; // 30 seconds timeout (check every 500ms)

    const interval = setInterval(() => {
        attempts++;
        const sent = triggerSend();
        
        if (sent) {
            console.log("Yash Automator: Message sent successfully.");
            clearInterval(interval);
        } else if (attempts >= maxAttempts) {
            console.warn("Yash Automator: Timed out waiting for send button.");
            clearInterval(interval);
        }
    }, 500);
}

// Run immediately on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForSendButtonAndClick);
} else {
    waitForSendButtonAndClick();
}

// Watch for URL changes (WhatsApp is a Single Page App)
let lastUrl = location.href; 
const observer = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Small delay to allow WhatsApp router to process URL params
    setTimeout(waitForSendButtonAndClick, 1000); 
  }
});

observer.observe(document, {subtree: true, childList: true});