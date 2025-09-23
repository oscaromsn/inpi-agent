// cli.ts lets you invoke the agent loop from the command line

import { setLogLevel } from "../baml_client/config";
import { agentLoopStream, Thread } from "./agents/assistant";

export async function cli() {
  const readline = require("node:readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const args = process.argv.slice(2);
  const debug = args.includes("-d") || args.includes("--debug");
  // Determine BAML log level: environment var BAML_LOG overrides debug flag
  const envLevel = process.env.BAML_LOG;
  const logLevel = envLevel ? envLevel.toUpperCase() : debug ? "INFO" : "OFF";
  setLogLevel(logLevel);
  const thread = new Thread([]);
  console.log("Type your message (type '/exit' to quit):");
  while (true) {
    const message: string = await new Promise((resolve) => {
      readline.question("> ", (answer: string) => resolve(answer));
    });
    if (message.trim().toLowerCase() === "/exit") {
      console.log("Goodbye!");
      readline.close();
      process.exit(0);
    }
    thread.events.push({ type: "user_input", data: message });
    let result = await handleStreamingAgentLoop(thread, debug, readline);
    let lastEvent = result.events.slice(-1)[0];

    // Handle follow-up clarification requests
    while (lastEvent.data.intent === "request_more_information") {
      const answer = await askHuman(lastEvent.data.message);
      if (answer.trim().toLowerCase() === "/exit") {
        console.log("Goodbye!");
        readline.close();
        process.exit(0);
      }
      thread.events.push({ type: "human_response", data: answer });
      result = await handleStreamingAgentLoop(thread, debug, readline);
      lastEvent = result.events.slice(-1)[0];
    }
  }
}

async function handleStreamingAgentLoop(
  thread: Thread,
  debug: boolean,
  _readline: any
): Promise<Thread> {
  let previousMessage = "";
  let isToolExecuting = false;

  const generator = agentLoopStream(thread, debug);
  let result = await generator.next();

  while (!result.done) {
    const event = result.value;

    switch (event.type) {
      case "partial":
        if (event.data.message) {
          // Only output the new part of the message
          const newContent = event.data.message.slice(previousMessage.length);
          if (newContent) {
            process.stdout.write(newContent);
            previousMessage = event.data.message;
          }
        }
        break;

      case "tool_start":
        if (!debug) {
          // Ensure we're on a new line before showing tool execution
          if (previousMessage && !previousMessage.endsWith("\n")) {
            console.log();
          }
          console.log(`🔧 Executing ${event.data.intent}...`);
        }
        isToolExecuting = true;
        break;

      case "tool_complete":
        if (!debug && isToolExecuting) {
          console.log(`✅ ${event.data.intent} completed`);
        }
        isToolExecuting = false;
        break;

      case "tool_error":
        if (!debug && isToolExecuting) {
          console.log(
            `❌ ${event.data.intent} failed: ${event.data.error.message}`
          );
        }
        isToolExecuting = false;
        break;

      case "complete":
        // Ensure we end on a new line if there was streaming content
        if (previousMessage && !previousMessage.endsWith("\n")) {
          console.log();
        }
        break;
    }

    result = await generator.next();
  }

  // result.value contains the final thread state when the generator is done
  return result.value;
}

async function askHuman(message: string): Promise<string> {
  const readline = require("node:readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question(`${message}\n> `, (answer: string) => {
      readline.close();
      resolve(answer);
    });
  });
}
