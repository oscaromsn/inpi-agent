import express from "express";
import { ThreadStore } from "../lib/state";
import { agentLoop, agentLoopStream, Thread } from "./agents/assistant";

const app = express();
app.use(express.json());

const store = new ThreadStore();

// POST /thread - Start new thread
app.post("/thread", async (req, res) => {
  const thread = new Thread([
    {
      type: "user_input",
      data: req.body.message,
    },
  ]);

  const threadId = store.create(thread);
  const result = await agentLoop(thread);

  // If clarification is needed, include the response URL
  const lastEvent = result.events[result.events.length - 1];
  if (lastEvent.data.intent === "request_more_information") {
    lastEvent.data.response_url = `/thread/${threadId}/response`;
  }

  store.update(threadId, result);
  res.json({
    thread_id: threadId,
    ...result,
  });
});

// POST /thread/stream - Start new thread with streaming
app.post("/thread/stream", async (req, res) => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  const thread = new Thread([
    {
      type: "user_input",
      data: req.body.message,
    },
  ]);

  const threadId = store.create(thread);

  // Send thread ID immediately
  res.write(
    `data: ${JSON.stringify({ type: "thread_created", thread_id: threadId })}\n\n`
  );

  try {
    const generator = agentLoopStream(thread);
    let result = await generator.next();

    while (!result.done) {
      const event = result.value;

      // Send streaming events to client
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      if (event.type === "complete") {
        // If clarification is needed, include the response URL
        if (event.data.intent === "request_more_information") {
          event.data.response_url = `/thread/${threadId}/response`;
        }
      }

      result = await generator.next();
    }

    // Update the store with final thread state
    store.update(threadId, result.value);
  } catch (error: any) {
    res.write(
      `data: ${JSON.stringify({ type: "error", error: error.message || String(error) })}\n\n`
    );
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});

// GET /thread/:id - Get thread status
app.get("/thread/:id", (req, res) => {
  const thread = store.get(req.params.id);
  if (!thread) {
    return res.status(404).json({ error: "Thread not found" });
  }
  res.json(thread);
});

// POST /thread/:id/response - Handle clarification response
app.post("/thread/:id/response", async (req, res) => {
  const thread = store.get(req.params.id);
  if (!thread) {
    return res.status(404).json({ error: "Thread not found" });
  }

  thread.events.push({
    type: "human_response",
    data: req.body.message,
  });

  const result = await agentLoop(thread);

  // If another clarification is needed, include the response URL
  const lastEvent = result.events[result.events.length - 1];
  if (lastEvent.data.intent === "request_more_information") {
    lastEvent.data.response_url = `/thread/${req.params.id}/response`;
  }

  store.update(req.params.id, result);
  res.json(result);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app };
