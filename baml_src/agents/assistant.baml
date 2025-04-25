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
) -> HumanTools | CalculatorTools {
    client "openai/gpt-4o"

    prompt #"
        {{ _.role("system") }}

        You are a helpful assistant that can help with tasks.

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
