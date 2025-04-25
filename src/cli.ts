// cli.ts lets you invoke the agent loop from the command line

import { agentLoop, Thread, Event } from "../src/agent";

export async function cli() {
    const readline = require('node:readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const thread = new Thread([]);
    console.log("Type your message (type '/exit' to quit):");
    while (true) {
        const message: string = await new Promise((resolve) => {
            readline.question("> ", (answer: string) => resolve(answer));
        });
        if (message.trim().toLowerCase() === '/exit') {
            console.log("Goodbye!");
            readline.close();
            process.exit(0);
        }
        thread.events.push({ type: "user_input", data: message });
        let result = await agentLoop(thread);
        let lastEvent = result.events.slice(-1)[0];
        while (lastEvent.data.intent === "request_more_information") {
            const answer: string = await new Promise((resolve) => {
                readline.question(`${lastEvent.data.message}\n> `, (ans: string) => resolve(ans));
            });
            thread.events.push({ type: "human_response", data: answer });
            result = await agentLoop(thread);
            lastEvent = result.events.slice(-1)[0];
        }
        console.log(lastEvent.data.message);
    }
}

async function askHuman(message: string) {
    const readline = require('node:readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        readline.question(`${message}\n> `, (answer: string) => {
            readline.close();
            resolve(answer);
        });
    });
}
