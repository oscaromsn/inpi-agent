import { b } from "../../baml_client";
import { calculatorToolHandlers } from "../tools/calculator";
import { thinkToolHandler } from "../tools/think";
import { inpiToolHandlers } from "../tools/inpi_fetcher"; // Import INPI handlers
import type { InpiFetchSummary, InpiScraperResults, TrademarkEntry } from "../tools/inpi_fetcher"; // Import INPI result types

export interface Event {
    type: string;
    data: any;
}

export class Thread {
    events: Event[] = [];

    constructor(events: Event[]) {
        this.events = events;
    }

    serializeForLLM() {
        return this.events.map(e => this.serializeOneEvent(e)).join("\n\n"); // Add extra newline for clarity
    }

    trimLeadingWhitespace(s: string) {
        // Trim leading/trailing whitespace from the whole block, then indent body
        const lines = s.trim().split('\n');
        const tag = lines[0];
        const closingTag = lines[lines.length - 1];
        const body = lines.slice(1, -1).map(line => `  ${line.trim()}`).join('\n'); // Indent body
        return `${tag}\n${body}\n${closingTag}`;
    }

    serializeOneEvent(e: Event) {
        const data = e.data;
        let tag: string = e.type;
        let body: string;

        // --- Specific Serialization Logic ---

        // 1. Handle INPI Fetch Summary (tool_response for fetch_inpi_data)
        if (e.type === 'tool_response' && typeof data === 'object' && data !== null && 'result_id' in data && 'summary' in data && !('trademarks' in data)) {
             tag = "tool_response"; // Keep original type
             const summaryData = data as InpiFetchSummary;
             body = `result_id: ${summaryData.result_id}\nsummary: ${summaryData.summary}`;
        }
        // 2. Handle INPI Filtered Results (tool_response for filter_inpi_results)
        else if (e.type === 'tool_response' && typeof data === 'object' && data !== null && 'trademarks' in data && 'errors' in data) {
             tag = "tool_response"; // Keep original type
             const results = data as InpiScraperResults; // Full or filtered results
             const summary: string[] = [];
             if (results.trademarks.length > 0) {
                 summary.push(`Found ${results.trademarks.length} matching trademark(s):`);
                 // Show details of the filtered results (up to a limit)
                 for (const t of results.trademarks.slice(0, 5)) { // Show more details for filtered results
                     summary.push(`- Numero: ${t.Numero ?? 'N/A'}, Marca: ${t.Marca ?? 'N/A'}, Situacao: ${t.Situacao ?? 'N/A'}, Titular: ${t.Titular ?? 'N/A'}`);
                 }
                 if (results.trademarks.length > 5) {
                     summary.push(`... (and ${results.trademarks.length - 5} more)`);
                 }
             } else {
                 summary.push("No trademarks matched the filter criteria.");
             }
             if (results.errors.length > 0) {
                 summary.push(`Errors encountered: ${results.errors.join(', ')}`);
             }
             body = summary.join('\n');
        }
         // 3. Handle INPI Get Details / Find Most Recent Result (tool_response returning a single TrademarkEntry or error)
        else if (e.type === 'tool_response' && typeof data === 'object' && data !== null && ('Numero' in data || 'error' in data) && ('Marca' in data || 'error' in data)) { // Heuristic for TrademarkEntry or error object
             tag = "tool_response";
             if ('error' in data) {
                 body = `Error: ${data.error}`; // Generic error message for get_details or find_most_recent
             } else {
                 const entry = data as TrademarkEntry;
                 body = `Details for Numero ${entry.Numero}:\n` +
                        `  Marca: ${entry.Marca ?? 'N/A'}\n` +
                        `  Situacao: ${entry.Situacao ?? 'N/A'}\n` +
                        `  Titular: ${entry.Titular ?? 'N/A'}\n` +
                        `  Classes: ${entry.Classes?.join(', ') ?? 'N/A'}\n` +
                        `  URL: ${entry.URL ?? 'N/A'}`;
             }
        }
        // 4. Handle other tool calls (including fetch_inpi_data tool *call*)
        else if (typeof data === 'object' && data !== null && 'intent' in data) {
             const record = data as Record<string, unknown>;
             // Use intent as tag ONLY if it's not a type we handle specifically above or a core loop type
             const coreLoopTypes = ['tool_response', 'tool_error', 'human_response', 'user_input', 'tool_call'];
             if (typeof record.intent === 'string' && !coreLoopTypes.includes(e.type)) {
                 tag = record.intent;
             } else {
                 tag = e.type; // Keep original type for tool_call etc.
             }

             const entries = Object.keys(record)
                .filter((k): boolean => k !== 'intent') // Don't repeat intent in body if used as tag
                .map((k): string => {
                    const value = record[k];
                     if (typeof value === 'object' && value !== null) {
                         try { return `${k}: ${JSON.stringify(value)}`; } catch { return `${k}: [Unserializable Object]`; }
                     }
                    return `${k}: ${String(value)}`;
                });
             body = entries.join("\n");
             if (entries.length === 0 && typeof record.intent === 'string') {
                 body = `(No parameters for intent: ${record.intent})`; // Handle tools with no params
             }
        }
        // 5. Handle primitive types (user_input, human_response, simple tool_response like calculator)
        else {
            tag = e.type; // Ensure tag is correct
            body = String(data);
        }

        // Ensure body is not empty, provide a placeholder if necessary
        if (body.trim() === "") {
            body = "(No details)";
        }

        return this.trimLeadingWhitespace(`
<${tag}>
${body}
</${tag}>
        `);
    }
}

// Generic tool handling -------------------------------------------------------------------
type ToolHandler = (step: any) => any;

// Aggregate all tool handlers here.
const toolHandlers: Record<string, ToolHandler> = {
    ...calculatorToolHandlers,
    ...thinkToolHandler,
    ...inpiToolHandlers, // INPI handlers now include fetch, filter, get, and find_most_recent
};

async function handleTool(step: any, thread: Thread): Promise<Thread> {
    const handler = toolHandlers[step.intent as string];
    if (handler) {
        try {
            const result = await Promise.resolve(handler(step));
            console.log(`tool_response for intent [${step.intent}]:`, result);
            thread.events.push({
                type: "tool_response",
                data: result,
            });
        } catch (error: any) {
            console.error(`Error executing tool ${step.intent}:`, error);
            thread.events.push({
                type: "tool_error",
                data: {
                    toolIntent: step.intent,
                    message: error.message || String(error),
                 },
            });
        }
    } else {
        console.warn(`Unhandled tool intent: ${step.intent}`);
         thread.events.push({
                type: "tool_error",
                data: {
                    toolIntent: step.intent,
                    message: `No handler found for intent: ${step.intent}`,
                 },
            });
    }
    return thread;
}

// Agent Loop -------------------------------------------------------------------------------
export async function agentLoop(initialThread: Thread): Promise<Thread> {

    let thread = initialThread;

    while (true) {
        const llmContext = thread.serializeForLLM();
        console.log("--- Sending to LLM ---");
        console.log(llmContext);
        console.log("----------------------");

        const nextStep = await b.DetermineNextStep(llmContext);
        console.log("LLM Determined Next Step:", nextStep);

        // Log the tool call *before* execution
        thread.events.push({
            "type": "tool_call",
            "data": nextStep
        });

        switch (nextStep.intent) {
            case "done_for_now":
            case "request_more_information":
                // These intents require human interaction or signal completion, return thread state.
                return thread;
            default:
                // Handle all other tools (calculator, think, fetch_inpi_data, filter_inpi_results, get_inpi_details)
                thread = await handleTool(nextStep, thread);
                // After handling a tool, the loop continues to determine the *next* step based on the *new* thread state.
                break;
        }
    }
}