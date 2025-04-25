import { b } from "../baml_client";
import { calculatorToolHandlers } from "./tools/calculator";
import { thinkToolHandler } from "./tools/think";

export interface Event {
    type: string
    data: any;
}

export class Thread {
    events: Event[] = [];

    constructor(events: Event[]) {
        this.events = events;
    }

    serializeForLLM() {
        return this.events.map(e => this.serializeOneEvent(e)).join("\n");
    }

    trimLeadingWhitespace(s: string) {
        return s.replace(/^[ \t]+/gm, '');
    }

    serializeOneEvent(e: Event) {
        const data = e.data;
        let tag: string = e.type;
        let body: string;

        if (typeof data === 'object' && data !== null) {
            const record = data as Record<string, unknown>;
            if (typeof record.intent === 'string') {
                tag = record.intent;
            }
            const entries = Object.keys(record)
                .filter((k): boolean => k !== 'intent')
                .map((k): string => `${k}: ${String(record[k])}`);
            body = entries.join("\n");
        } else {
            body = String(data);
        }

        return this.trimLeadingWhitespace(`
            <${tag}>
${body}
            </${tag}>
        `)
    }
}

// Generic tool handling -------------------------------------------------------------------
type ToolHandler = (step: any) => any;

// Aggregate all tool handlers here. To add new tools, simply spread their handlers into this map.
const toolHandlers: Record<string, ToolHandler> = {
    ...calculatorToolHandlers,
    ...thinkToolHandler,
};

async function handleTool(step: any, thread: Thread): Promise<Thread> {
    const handler = toolHandlers[step.intent as string];
    if (handler) {
        const result = handler(step);
        console.log("tool_response", result);
        thread.events.push({
            type: "tool_response",
            data: result,
        });
    } else {
        console.warn(`Unhandled tool intent: ${step.intent}`);
    }
    return thread;
}

export async function agentLoop(initialThread: Thread): Promise<Thread> {

    let thread = initialThread;

    while (true) {
        const nextStep = await b.DetermineNextStep(thread.serializeForLLM());
        console.log("nextStep", nextStep);

        thread.events.push({
            "type": "tool_call", // Log the tool call itself
            "data": nextStep
        });

        switch (nextStep.intent) {
            case "done_for_now":
            case "request_more_information":
                // These intents require human interaction, so we return the thread state.
                return thread;
            // REMOVED the think case here - it should fall through to default
            default:
                // Handle other tools (including 'think')
                thread = await handleTool(nextStep, thread);
                // After handling a tool (like 'think' or 'add'),
                // the loop continues to determine the *next* step.
                break; // Explicitly break to continue the while loop
        }
    }
}