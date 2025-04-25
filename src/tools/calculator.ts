import type { AddTool, SubtractTool, MultiplyTool, DivideTool } from "../../baml_client";

// Calculator operation handlers
function add(step: AddTool): number {
  return step.a + step.b;
}

function subtract(step: SubtractTool): number {
  return step.a - step.b;
}

function multiply(step: MultiplyTool): number {
  return step.a * step.b;
}

function divide(step: DivideTool): number {
  return step.a / step.b;
}

// Map of intent -> handler for registration in the main agent.
export const calculatorToolHandlers = {
  add,
  subtract,
  multiply,
  divide,
} as const;

// Re-export union for convenience when the agent needs the explicit type.
export type CalculatorTool = AddTool | SubtractTool | MultiplyTool | DivideTool;
