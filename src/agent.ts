import { b } from "../baml_client";
import type { AddTool, SubtractTool, MultiplyTool, DivideTool } from "../baml_client";

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

export type CalculatorTool = AddTool | SubtractTool | MultiplyTool | DivideTool;

export async function handleNextStep(nextStep: CalculatorTool, thread: Thread): Promise<Thread> {
    let result: number;
    switch (nextStep.intent) {
        case "add":
            result = nextStep.a + nextStep.b;
            console.log("tool_response", result);
            thread.events.push({
                "type": "tool_response",
                "data": result
            });
            return thread;
        case "subtract":
            result = nextStep.a - nextStep.b;
            console.log("tool_response", result);
            thread.events.push({
                "type": "tool_response",
                "data": result
            });
            return thread;
        case "multiply":
            result = nextStep.a * nextStep.b;
            console.log("tool_response", result);
            thread.events.push({
                "type": "tool_response",
                "data": result
            });
            return thread;
        case "divide":
            result = nextStep.a / nextStep.b;
            console.log("tool_response", result);
            thread.events.push({
                "type": "tool_response",
                "data": result
            });
            return thread;
    }
}

export async function agentLoop(initialThread: Thread): Promise<Thread> {

    let thread = initialThread;

    while (true) {
        const nextStep = await b.DetermineNextStep(thread.serializeForLLM());
        console.log("nextStep", nextStep);

        thread.events.push({
            "type": "tool_call",
            "data": nextStep
        });

        switch (nextStep.intent) {
            case "done_for_now":
            case "request_more_information":
                // response to human, return the next step object
                return thread;
            case "add":
            case "subtract":
            case "multiply":
            case "divide":
                thread = await handleNextStep(nextStep, thread);
        }
    }
}
