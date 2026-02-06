// content_console.js

// Function to mark the page as active
function markExtensionActive() {
    // We mark the HTML tag because React often wipes the BODY tag
    document.documentElement.setAttribute('data-yash-extension-active', 'true');
    if (document.body) {
        document.body.setAttribute('data-yash-extension-active', 'true');
    }
}

// 1. Mark immediately
markExtensionActive();

// 2. Mark periodically to fight any Virtual DOM updates that might wipe attributes
setInterval(markExtensionActive, 1000);

// 3. Dispatch global event
window.dispatchEvent(new CustomEvent('YASH_EXTENSION_READY'));

// 4. Listen for App Events
window.addEventListener('YASH_WA_SEND', (event) => {
    const { phone, message } = event.detail;
    
    if (phone && message) {
        chrome.runtime.sendMessage({
            type: "OPEN_WA_TAB",
            phone: phone,
            message: message
        });
    }
});

console.log("Yash Extension: Console Bridge Loaded & Active");