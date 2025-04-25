type ThinkTools = ThinkTool

class ThinkTool {
  intent "think" @description("Think about something internally without taking external action. Use this for complex reasoning or planning.")
  thought string @description("The thought process or internal reasoning step.")
}


test SimpleThought {
  functions [DetermineNextStep] // Assuming DetermineNextStep is the main agent function
  args {
    thread #"
      <user_input>
        What are the steps to calculate (3 * 4) / 2 + 12?
      </user_input>
    "#
  }
  // Expect the agent to think about the steps first
  @@assert(intent, {{this.intent == "think"}})
  @@assert(thought_contains_steps, {{ "multiply" in this.thought and "divide" in this.thought and "add" in this.thought }})
}

test ThoughtBeforeCalculation {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
        Calculate (3 * 4) / 2 + 12
      </user_input>
      <think>
        thought: The user wants to calculate (3 * 4) / 2 + 12.
                 1. First, multiply 3 by 4.
                 2. Then, divide the result by 2.
                 3. Finally, add 12 to that result.
                 Okay, I will start with the multiplication.
      </think>
      <tool_response>
        Thinking complete!
      </tool_response>
    "#
  }
  // After thinking, the agent should proceed with the first calculation step
  @@assert(intent, {{this.intent == "multiply"}})
  @@assert(a, {{this.a == 3}})
  @@assert(b, {{this.b == 4}})
}