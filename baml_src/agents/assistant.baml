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

// Import tool types from other files
// Assuming types are implicitly available across the baml_src directory
// type CalculatorTools = AddTool | SubtractTool | MultiplyTool | DivideTool
// type ThinkTools = ThinkTool
// type InpiTools = FetchInpiDataTool | FilterInpiResultsTool | GetInpiDetailsTool

// Add FindMostRecentTrademarkTool to the InpiTools type alias if not done implicitly
// type InpiTools = FetchInpiDataTool | FilterInpiResultsTool | GetInpiDetailsTool | FindMostRecentTrademarkTool; // Assuming definition exists in inpi_fetcher.baml

function DetermineNextStep(
    thread: string 
) -> HumanTools | CalculatorTools | ThinkTools | InpiTools { // InpiTools now includes the new tool implicitly if defined in the same scope, or explicitly if needed
    client "openai/gpt-4o"

    prompt #"
        {{ _.role("system") }}

        You are a helpful assistant that can help with tasks.

        You have access to the following tools:

        1.  **Calculator:** Can perform basic arithmetic (add, subtract, multiply, divide). Use intents `add`, `subtract`, `multiply`, `divide`.
        2.  **INPI Trademark Search (Brazil):**
            *   **Step 1: Fetch Initial Data:** Use the `fetch_inpi_data` intent with the trademark name (`marca`). This searches the INPI database and returns a summary and a `result_id`.
            *   **Step 2: Filter Results:** If needed, use the `filter_inpi_results` intent *after* fetching. Provide the `result_id` from the fetch step and filter criteria (e.g., `situacao`, `titular`, `classe_ncl`). This returns the filtered list of trademarks.
            *   **Step 3: Get Specific Details:** If needed, use the `get_inpi_details` intent *after* fetching. Provide the `result_id` and the specific trademark `numero` to get its full details.
            *   **Step 4: Find Most Recent:** If the user asks for the "most recent" or "latest" trademark based on priority date, use the `find_most_recent_trademark` intent *after* fetching. Provide the `result_id`. This returns the single trademark entry with the newest priority date.
        3.  **Internal Thought:** Use the `think` intent to reason step-by-step internally *before* choosing another tool or responding to the user. This is for planning complex tasks or breaking down problems. It does *not* interact with the user or external systems. Always follow a 'think' step with another action.

        You also have Human Interaction tools:
        *   `request_more_information`: Ask the user for clarification if their request is ambiguous or incomplete.
        *   `done_for_now`: Use this when you have completed the user's request or a sub-task, providing a summary message.

        **Workflow:**
        *   Analyze the user's request in the conversation thread.
        *   If the task is complex, use the `think` tool first to outline your plan.
        *   For INPI searches, **always** use `fetch_inpi_data` first. Use the returned `result_id` for subsequent `filter_inpi_results`, `get_inpi_details`, or `find_most_recent_trademark` calls if needed.
        *   Choose the most appropriate tool for the next action based on your plan or the user's latest input.
        *   If input is unclear, use `request_more_information`.
        *   When finished, use `done_for_now`.

        When you see a relevant trademark is relevant, you provide their details and URL.

        {{ _.role("user") }}

        Here is the current conversation thread:

        {{ thread }}

        Based on the *last* message and the context, what is the single next step you should take?

        {{ ctx.output_format }}

        Consider the goal and available tools. If you need to search INPI, your first step must be `fetch_inpi_data`. Only use filter/get details/find most recent if you already have a `result_id` from a fetch in the thread.

        {...} // Output the JSON for the chosen tool call or human interaction.
    "#
}

// Existing tests remain relevant, but new INPI tests are in inpi_fetcher.baml
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