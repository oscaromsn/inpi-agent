import type { AddTool, SubtractTool, MultiplyTool, DivideTool } from "../../baml_client";

// Define specific result types for calculator operations
interface CalculationResult {
  type: 'calculation';
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  result: number;
  toLLMString(): string; // Method for LLM serialization
}

// Calculator operation handlers
function add(step: AddTool): CalculationResult {
  const result = step.a + step.b;
  return {
    type: 'calculation',
    operation: 'add',
    result,
    toLLMString: () => result.toString(), // Simple number serialization
  };
}

function subtract(step: SubtractTool): CalculationResult {
  const result = step.a - step.b;
  return {
    type: 'calculation',
    operation: 'subtract',
    result,
    toLLMString: () => result.toString(),
  };
}

function multiply(step: MultiplyTool): CalculationResult {
  const result = step.a * step.b;
  return {
    type: 'calculation',
    operation: 'multiply',
    result,
    toLLMString: () => result.toString(),
  };
}

function divide(step: DivideTool): CalculationResult {
    if (step.b === 0) {
        throw new Error("Division by zero is not allowed.");
    }
    const result = step.a / step.b;
    return {
        type: 'calculation',
        operation: 'divide',
        result,
        toLLMString: () => result.toString(),
    };
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

// Export the result type
export type { CalculationResult };