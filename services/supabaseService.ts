
import { createClient } from '@supabase/supabase-js';
import { ProcessedParty } from '../types';

const PROJECT_URL = 'https://mbkonzpwfbkulrljnwgw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ia29uenB3ZmJrdWxybGpud2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzAwMTEsImV4cCI6MjA4NTYwNjAxMX0.bxjFqcfWgDcVsOtxb3-Mq8jVtVHoswFDVoLRfmQth8E';

export const supabase = createClient(PROJECT_URL, ANON_KEY);

// Helper for fuzzy matching: removes all non-alphanumeric chars and lowers case
// e.g. "M/S. VARDHMAN TRADING" -> "msvardhmantrading"
const normalizeName = (name: string) => {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// --- GLOBAL STATE MANAGEMENT (CLOUD SYNC) ---

export const fetchGlobalData = async (): Promise<{ data: ProcessedParty[], lastUpdated: string | null } | null> => {
    try {
        const { data, error } = await supabase
            .from('app_data')
            .select('content, last_updated')
            .eq('id', 1) // We use ID 1 as the singleton record for the dashboard state
            .single();

        if (error) {
            // If row doesn't exist yet, return null (empty state)
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        if (data && data.content) {
            return {
                data: data.content as ProcessedParty[],
                lastUpdated: data.last_updated ? new Date(data.last_updated).toLocaleString('en-IN', { 
                    day: '2-digit', month: 'short', year: '2-digit', 
                    hour: '2-digit', minute: '2-digit', hour12: true 
                }) : null
            };
        }
        return null;
    } catch (err) {
        console.error("Error fetching global data:", err);
        return null;
    }
};

export const saveGlobalData = async (parties: ProcessedParty[]) => {
    try {
        const { error } = await supabase
            .from('app_data')
            .upsert({ 
                id: 1, 
                content: parties,
                last_updated: new Date().toISOString()
            });
            
        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error("Error saving global data:", err);
        return { success: false, error: err };
    }
};

export const clearGlobalData = async () => {
    try {
        const { error } = await supabase
            .from('app_data')
            .delete()
            .eq('id', 1);
            
        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error("Error clearing global data:", err);
        return { success: false, error: err };
    }
};

// --- PREFIX GUIDE SYNC ---

export const fetchBillPrefixes = async (): Promise<Record<string, string> | null> => {
    try {
        const { data, error } = await supabase
            .from('bill_prefixes')
            .select('prefix, company_name');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const map: Record<string, string> = {};
            data.forEach((row: any) => {
                if (row.prefix && row.company_name) {
                    map[row.prefix] = row.company_name;
                }
            });
            return map;
        }
        return null;
    } catch (err) {
        console.error("Error fetching prefixes:", err);
        return null;
    }
};

export const uploadBillPrefixes = async (prefixes: Record<string, string>) => {
    try {
        const rows = Object.entries(prefixes).map(([prefix, company_name]) => ({
            prefix,
            company_name,
            updated_at: new Date()
        }));

        // Upsert allows updating existing prefixes and adding new ones
        const { error } = await supabase
            .from('bill_prefixes')
            .upsert(rows, { onConflict: 'prefix' });

        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error("Error saving prefixes:", err);
        return { success: false, error: err };
    }
};

// --- PHONE NUMBER SYNC (EXISTING) ---

/**
 * "Staging Table" Architecture Implementation:
 * 1. The CSV upload acts as the raw data source.
 * 2. This service fetches the "Master" contact data from Supabase 'parties' table.
 * 3. It acts as a transformation layer, merging Master Contact Data into the Console's view.
 */
export const syncPartyMobileNumbers = async (
    parties: ProcessedParty[], 
    onStatus?: (status: 'success' | 'error', msg?: string) => void
): Promise<ProcessedParty[]> => {
    try {
        // Fetch existing contacts. Increased range to 10,000 to ensure we don't hit default pagination limits.
        const { data: dbParties, error } = await supabase
            .from('parties')
            .select('party_name, phone_number')
            .range(0, 9999); 
        
        if (error) {
            console.error("Supabase Sync Error:", error);
            if (onStatus) onStatus('error', error.message);
            return parties;
        }

        if (onStatus) onStatus('success');

        if (!dbParties || dbParties.length === 0) return parties;

        // Strategy:
        // 1. Exact Match Map (Trimmed + Lowercase) for highest accuracy
        // 2. Fuzzy Match Map (Normalized alphanumeric) for handling "Co." vs "Company" or extra spaces
        const exactMap = new Map<string, string>();
        const fuzzyMap = new Map<string, string>();

        dbParties.forEach((p: any) => {
            if (p.party_name && p.phone_number) {
                const name = p.party_name.toString();
                exactMap.set(name.trim().toLowerCase(), p.phone_number);
                fuzzyMap.set(normalizeName(name), p.phone_number);
            }
        });

        // Merge DB phones into CSV data
        return parties.map(p => {
            const pName = p.partyName.trim();
            
            // 1. Try Exact Match
            let dbPhone = exactMap.get(pName.toLowerCase());
            
            // 2. Try Fuzzy Match if exact failed
            if (!dbPhone) {
                dbPhone = fuzzyMap.get(normalizeName(pName));
            }

            // If found in DB, it overrides local state
            if (dbPhone) {
                return { ...p, phoneNumber: dbPhone };
            }
            return p;
        });

    } catch (err: any) {
        console.error("Staging Sync Failed:", err);
        if (onStatus) onStatus('error', err.message || "Unknown Network Error");
        return parties;
    }
};

export const upsertPartyMobile = async (partyName: string, phoneNumber: string) => {
    try {
        // We save exactly what the CSV provided as the party_name key
        // to ensure it matches exactly next time for this specific CSV format.
        const { error } = await supabase
            .from('parties')
            .upsert(
                { 
                  party_name: partyName.trim(), 
                  phone_number: phoneNumber,
                  updated_at: new Date()
                },
                { onConflict: 'party_name' }
            );
        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error("Failed to update Supabase:", err);
        return { success: false, error: err };
    }
};
