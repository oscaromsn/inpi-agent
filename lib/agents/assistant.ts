import { b } from "../../baml_client";
import { calculatorToolHandlers } from "../tools/calculator";
import { thinkToolHandler } from "../tools/think";
import { inpiToolHandlers } from "../tools/inpi_fetcher"; // Import INPI handlers

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

        // Generic serialization for tool_response using toLLMString if available
        if (e.type === 'tool_response' && data !== null && typeof (data as any).toLLMString === 'function') {
            tag = "tool_response";
            body = (data as any).toLLMString();
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