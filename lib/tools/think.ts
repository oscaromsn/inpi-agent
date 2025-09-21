import type { ThinkTool as BamlThinkTool } from "../../baml_client";
import { getLogLevel } from "../../baml_client/config";

// Result type for the think tool handler
interface ThinkResult {
  type: 'think_result';
  thought: string;
  toLLMString(): string;
}

// Think tool handler
function think(step: BamlThinkTool): ThinkResult {
  if (getLogLevel() !== "OFF") console.log(`Thinking: ${step.thought}`);
  // The actual "thinking" happens in the LLM prompt that generated this.
  // This handler just acknowledges the step was taken and formats the result.
  return {
    type: 'think_result',
    thought: step.thought,
    toLLMString: () => "Thinking complete!", // Simple acknowledgement for the LLM context
  };
}

export const thinkToolHandler = {
  think,
} as const;

// Re-export type for convenience
export type { ThinkResult }; // Export the result type
