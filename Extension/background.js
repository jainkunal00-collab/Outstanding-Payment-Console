
// background.js

const SUPABASE_URL = 'https://mbkonzpwfbkulrljnwgw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ia29uenB3ZmJrdWxybGpud2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzAwMTEsImV4cCI6MjA4NTYwNjAxMX0.bxjFqcfWgDcVsOtxb3-Mq8jVtVHoswFDVoLRfmQth8E';

const DEFAULT_PREFIX_MAP = {
  "Al/25-26/": "GSK",
  "*HAL/25/": "GSK",
  "BSO25": "Johnson",
  "JJGS25": "Johnson",
  "C25Y": "Cadbury",
  "D/25-26/": "Figaro",
  "E/25-26/": "Hershey",
  "FR2526027": "Ferrero",
  "H/25-26/": "Haldram",
  "I/25-26/": "Ziggy",
  "K/25-26/": "Kellogs",
  "LIN10025": "Loreal",
  "LCBL04725": "Loreal",
  "M/25-26/": "Malas",
  "N/25-26/": "3M",
  "O/25-26/": "Lotte",
  "Q/25-26/": "Jimmy",
  "*Q/24-25/": "Jimmy",
  "R/25-26/": "Havells",
  "*R/24-25/": "Havells",
  "S2526411": "Catch",
  "*S2425411": "Catch",
  "T/25-26/": "Tops",
  "U/25-26/": "Budweiser",
  "V/25-26/": "Vebba",
  "W/25-26/": "Wabh Bakri",
  "Z/25-26/": "Delmonte"
};

// 1. Listen for messages from the React App (Console)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "OPEN_WA_TAB") {
        handleWhatsAppTab(request.phone, request.message);
    }
});

// 2. Handle Extension Icon Click (Open WhatsApp Web directly)
chrome.action.onClicked.addListener(async (tab) => {
    const waUrl = "https://web.whatsapp.com/";
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
    } else {
        chrome.tabs.create({ url: waUrl });
    }
});

// 3. Create Right-Click Context Menu
chrome.runtime.onInstalled.addListener(() => {
    // Remove existing to avoid duplicate id errors
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "check-outstanding",
            title: "Check Outstanding Balance",
            contexts: ["selection"]
        });
    });
});

// 4. Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "check-outstanding") {
        // SAFETY CHECK: Ensure we have text to search
        if (!info.selectionText) {
            console.warn("No selection text found.");
            return;
        }

        // SAFETY CHECK: Ensure we have a valid tab to show alert in
        if (!tab || !tab.id) {
            console.warn("No active tab identified.");
            return;
        }

        const query = info.selectionText.trim();
        console.log("Searching for:", query);

        try {
            // Fetch Parties and Prefixes in parallel
            const [parties, dynamicPrefixes] = await Promise.all([
                fetchPartiesFromCloud(),
                fetchBillPrefixes()
            ]);

            const prefixMap = { ...DEFAULT_PREFIX_MAP, ...dynamicPrefixes };
            const match = findParty(parties, query);
            
            // Determine if query was a phone number for fallback logic (Master list check)
            // We strip everything except digits to check if there is a valid phone number segment
            const digitsOnly = query.replace(/[^0-9]/g, '');
            const hasSignificantDigits = digitsOnly.length > 5;

            let message = "";
            if (match) {
                // FOUND IN CONSOLE DATA: Show full details regardless of search type (Name or Phone)
                const debit = formatCurrency(match.balanceDebit || 0);
                message = `✅ PARTY FOUND\n\nName: ${match.partyName}\nTotal Outstanding: ${debit}`;
                
                if (match.balanceCredit > 0) {
                    message += `\nCredit Balance: ${formatCurrency(match.balanceCredit)}`;
                }
                
                if (match.phoneNumber) {
                    message += `\nPhone: ${match.phoneNumber}`;
                }
                
                const pendingBills = (match.bills || []).filter(b => b.billAmt > 0 && b.status !== 'paid');
                
                if (pendingBills.length > 0) {
                    message += `\n\nPending Bills:\n`;
                    // Limit to 20 bills to prevent alert from being too tall
                    const displayBills = pendingBills.slice(0, 20); 
                    
                    displayBills.forEach(b => {
                        const company = getCompanyName(b.billNo, prefixMap) || "D.N/TCS";
                        const isAdjusted = b.billAmt < (b.originalBillAmt || b.billAmt);
                        const suffix = isAdjusted ? ' (B)' : '';
                        const amt = formatCurrency(b.billAmt);
                        // Format: Bill Catch S25264111759 (23-Jan-26): ₹4,12,732 (B)
                        message += `Bill ${company} ${b.billNo} (${b.billDate}): ${amt}${suffix}\n`;
                    });

                    if (pendingBills.length > 20) {
                        message += `... and ${pendingBills.length - 20} more bills.`;
                    }
                } else {
                    message += `\n\nNo Pending Bills.`;
                }
                
            } else {
                // FALLBACK: If not found in console data, check Master Contact List (Supabase 'parties' table)
                let masterName = null;
                if (hasSignificantDigits) {
                    masterName = await fetchPartyNameFromMaster(digitsOnly);
                }

                if (masterName) {
                    // FOUND IN MASTER LIST ONLY: Show Name Only
                    message = `✅ PARTY FOUND (Master List)\n\nName: ${masterName}\n\n(No outstanding balance in current console data)`;
                } else {
                    message = `❌ NO RECORD FOUND\n\nCould not find a party matching "${query}" in your console data.`;
                }
            }

            // Inject the alert into the page
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (msg) => alert(msg),
                args: [message]
            }).catch(err => console.error("Script Injection Error:", err));

        } catch (err) {
            console.error("Processing Error:", err);
            // Try to notify user of error
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => alert("Error: Could not retrieve data from Yash Cloud.")
            }).catch(e => console.error(e));
        }
    }
});

// --- HELPER FUNCTIONS ---

async function fetchPartiesFromCloud() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/app_data?select=content&id=eq.1`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        
        // Safety checks for data structure
        if (Array.isArray(data) && data.length > 0 && data[0].content) {
            return data[0].content;
        }
        return [];
    } catch (error) {
        console.error("Fetch Error:", error);
        return [];
    }
}

async function fetchBillPrefixes() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/bill_prefixes?select=prefix,company_name`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) return {};
        const data = await response.json();
        const map = {};
        if (Array.isArray(data)) {
            data.forEach(row => {
                if (row.prefix && row.company_name) {
                    map[row.prefix] = row.company_name;
                }
            });
        }
        return map;
    } catch (error) {
        console.error("Fetch Prefixes Error:", error);
        return {};
    }
}

async function fetchPartyNameFromMaster(phoneRaw) {
    if (!phoneRaw || phoneRaw.length < 5) return null;

    // Optimize search term: if > 10 digits, take last 10 to handle country codes/prefixes
    // We search using the digits found in the selection
    let searchTerm = phoneRaw;
    if (searchTerm.length > 10) {
        searchTerm = searchTerm.slice(-10);
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/parties?phone_number=ilike.%25${searchTerm}&select=party_name&limit=1`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            return data[0].party_name;
        }
    } catch (error) {
        console.error("Master Fetch Error:", error);
    }
    return null;
}

function findParty(parties, query) {
    if (!parties || !query) return undefined;

    const cleanQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const digitsOnly = query.replace(/[^0-9]/g, '');
    
    return parties.find(p => {
        if (!p) return false;

        const pName = (p.partyName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        const pPhone = (p.phoneNumber || "").replace(/[^0-9]/g, '');

        // 1. Name Match: Check if one string is included in the other
        // This handles cases where selection is "Party Name Phone" (cleanQuery includes pName)
        // or where selection is "Party" (pName includes cleanQuery)
        if (pName.length >= 3 && (pName.includes(cleanQuery) || cleanQuery.includes(pName))) {
            return true;
        }

        // 2. Phone Match: Check if the digits in the selection match the party phone
        if (digitsOnly.length >= 5) {
            // Check if party phone exists in the selection (e.g. selection="Name 9812345678")
            if (pPhone && digitsOnly.includes(pPhone)) return true;
            
            // Check if selection digits match part of party phone (e.g. selection="812345678")
            if (pPhone && pPhone.includes(digitsOnly)) return true;
        }

        return false;
    });
}

function getCompanyName(billNo, map) {
    if (!billNo) return null;
    const upperBill = billNo.toUpperCase().trim();
    const strippedBill = upperBill.startsWith('*') ? upperBill.substring(1) : upperBill;
    const cleanBill = upperBill.replace(/[^A-Z0-9]/g, '');

    for (const rawPrefix in map) {
        const company = map[rawPrefix];
        const upperPrefix = rawPrefix.toUpperCase().trim();
        const strippedPrefix = upperPrefix.startsWith('*') ? upperPrefix.substring(1) : upperPrefix;
        
        if (upperBill.startsWith(upperPrefix)) return company;
        if (upperBill.startsWith(strippedPrefix)) return company;
        if (strippedBill.startsWith(strippedPrefix)) return company;
        
        // Clean match
        const cleanPrefix = upperPrefix.replace(/[^A-Z0-9]/g, '');
        if (cleanPrefix && cleanBill.startsWith(cleanPrefix)) return company;
    }
    return null;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

async function handleWhatsAppTab(phone, message) {
    let finalPhone = phone;
    if (finalPhone && finalPhone.length === 10) {
        finalPhone = '91' + finalPhone;
    }

    const waUrl = `https://web.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(message)}`;
    
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    
    if (tabs.length > 0) {
        const tabId = tabs[0].id;
        await chrome.tabs.update(tabId, { active: true });
        await chrome.tabs.update(tabId, { url: waUrl });
    } else {
        chrome.tabs.create({ url: waUrl });
    }
}
