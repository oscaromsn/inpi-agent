// human tools are async requests to a human
type HumanTools = ClarificationRequest | DoneForNow

class ClarificationRequest {
  intent "request_more_information" @description("you can request more information from me")
  message string
}

class DoneForNow {
  intent "done_for_now"

  message string @description(#"
    message to send to the user about the work that was done. 
  "#)
}

function DetermineNextStep(
    thread: string 
) -> HumanTools | CalculatorTools | ThinkTools {
    client "openai/gpt-4o"

    prompt #"
        {{ _.role("system") }}

        You are a helpful assistant that can help with tasks.

        You can use the following tools:
        
        - Calculator tools (add, subtract, multiply, divide)

        Sometimes, you may need to think through a problem step-by-step before acting. Use the 'think' tool for this internal reasoning. It helps you plan complex tasks or break down problems. It does *not* interact with the user or external systems. After thinking, decide on the next concrete action (like using the calculator or asking the user).

        {{ _.role("user") }}

        You are working on the following thread:

        {{ thread }}

        What should the next step be?

        {{ ctx.output_format }}

        Always think about what to do next first, like:

        - ...
        - ...
        - ...

        {...} // schema
    "#
}

test HelloWorld {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
        hello!
      </user_input>
    "#
  }
  @@assert(intent, {{this.intent == "request_more_information"}})
}