
import { GoogleGenAI } from "@google/genai";
import { ProcessedParty } from "../types";
import { getCompanyNameFromBillNo, UNMAPPED_KEY } from "./csvProcessor";

const getAiClient = () => {
    if (!process.env.API_KEY) {
        throw new Error("API Key not found");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Formats numbers into Indian style with commas
 */
const formatINRPlain = (amount: number) => {
  return new Intl.NumberFormat('en-IN').format(Math.round(amount));
};

export const generatePaymentReminder = async (party: ProcessedParty): Promise<string> => {
    try {
        const ai = getAiClient();
        const model = "gemini-3-flash-preview";
        
        const totalOutstanding = Math.abs(party.rawBalance);
        const billLines = party.bills
            .filter(b => b.billAmt > 0)
            .map(b => {
                const company = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
                const isAdjusted = b.billAmt < b.originalBillAmt;
                const suffix = isAdjusted ? ' (B)' : '';
                return `Bill ${company} ${b.billNo} (${b.billDate}): ₹${formatINRPlain(b.billAmt)}${suffix}`;
            })
            .join('\n');

        const prompt = `
            Generate a payment reminder message for the following party. 
            FOLLOW THE EXACT STRUCTURE BELOW. DO NOT add conversational filler before or after the message.
            
            Party Name: ${party.partyName}
            Total Outstanding: ₹${formatINRPlain(totalOutstanding)}
            
            Bill Details:
            ${billLines}

            STRICT FORMAT TO FOLLOW (Include exactly as shown):
            Payment Reminder - [FULL_PARTY_NAME]

            This is a reminder regarding your outstanding balance of ₹${formatINRPlain(totalOutstanding)}.  

            Pending Bill Details: 

            [BILL_LIST_HERE]

            We request you to kindly process the payment at your earliest convenience. If the payment has already been initiated, please share the transaction details for our records. 

            Yash Marketing, Hisar

            Instructions:
            1. Use the EXACT FULL Party Name provided above: "${party.partyName}". DO NOT shorten it or remove any city/location suffixes.
            2. For [BILL_LIST_HERE], use the exact bill lines provided above: "Bill [Company] [BillNo] ([Date]): ₹[Amount][Suffix]". 
            3. IMPORTANT: If a bill amount has a "(B)" suffix in the list provided above, YOU MUST INCLUDE IT in the final message.
            4. Ensure there are single empty lines between sections exactly as shown in the template.
            5. The response should start with "Payment Reminder - ..." and end with "Yash Marketing, Hisar".
        `;

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                temperature: 0.1, // Even lower temperature for stricter formatting
            }
        });

        // The model sometimes adds markdown code blocks or extra text, we just want the text property.
        let result = response.text || "Could not generate message.";
        
        // Clean up markdown code blocks if AI wrapped the text
        if (result.startsWith("```") && result.endsWith("```")) {
            result = result.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
        }

        return result.trim();
    } catch (error) {
        console.error("Gemini Error:", error);
        return "Error generating AI message. Please check API Key.";
    }
};
