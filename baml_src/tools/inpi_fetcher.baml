// Defines the tool structure for fetching trademark data from INPI Brazil.

class FetchInpiDataTool {
  intent "fetch_inpi_data" @description("Use this tool *first* to search for trademark information on the Brazilian National Institute of Industrial Property (INPI) website. This returns a summary and a result_id.")
  marca string @description("The exact trademark name to search for.")
}

class FilterInpiResultsTool {
  intent "filter_inpi_results" @description("After using 'fetch_inpi_data', use this tool to filter the stored results based on criteria. Requires a valid 'result_id' from a previous fetch.")
  result_id string @description("The ID returned by a previous 'fetch_inpi_data' call.")
  situacao string? @description("Filter by exact trademark status (e.g., 'Deferido', 'Em Exame').")
  titular string? @description("Filter by owner/holder name (case-insensitive contains).")
  classe_ncl string? @description("Filter by a specific Nice Classification (NCL) class (e.g., 'NCL(9)', 'NCL(42)').")
}

class GetInpiDetailsTool {
  intent "get_inpi_details" @description("After using 'fetch_inpi_data', use this tool to get full details for a specific trademark from the stored results. Requires a valid 'result_id' and the trademark 'numero'.")
  result_id string @description("The ID returned by a previous 'fetch_inpi_data' call.")
  numero string @description("The exact 'Numero' (number) of the trademark to retrieve.")
}

class TrademarkEntry {
  Numero string? @description("Trademark application or registration number.")
  Prioridade string? @description("Priority claim information, if any. Expected format: DD/MM/YYYY.")
  Marca string? @description("The name of the trademark.")
  Situacao string? @description("The current status of the trademark application/registration (e.g., 'Deferido', 'Em Exame').")
  Titular string? @description("The name of the trademark owner/holder.")
  Classes string[]? @description("List of Nice Classification (NCL) classes associated with the trademark.")
  URL string? @description("Direct URL to the trademark details page on the INPI website.")
}

// This represents the *full* raw results from the scraper, used internally by the handler
// but not directly returned to the LLM context after the initial fetch.
class InpiScraperResults {
  trademarks TrademarkEntry[] @description("A list of trademarks found matching the search criteria.")
  errors string[] @description("A list of error messages encountered during the search process, if any.")
}

// This is the summary returned to the LLM after the initial fetch.
class InpiFetchSummary {
  result_id string @description("A unique ID representing the fetched results. Use this ID with 'filter_inpi_results' or 'get_inpi_details'.")
  summary string @description("A brief summary of the search results (e.g., number of trademarks found, any errors).")
  // We could include the first few results here, but decided against it to keep context smaller.
  // first_few_results TrademarkEntry[]? @description("A small sample of the first few results found.")
}

class FindMostRecentTrademarkTool {
  intent "find_most_recent_trademark" @description("After using 'fetch_inpi_data', use this tool to find the trademark with the latest 'Prioridade' (priority/filing date) from the stored results. Requires a valid 'result_id'.")
  result_id string @description("The ID returned by a previous 'fetch_inpi_data' call.")
}


// Type alias for easier integration into the agent's return type union.
// Now includes the new filter, get details, and find most recent tools.
type InpiTools = FetchInpiDataTool | FilterInpiResultsTool | GetInpiDetailsTool | FindMostRecentTrademarkTool


// --- Test Cases ---

// Existing tests...

// Test case for finding the most recent trademark after a fetch.
test Inpi_Step2_FindMostRecent {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
      Search INPI for 'boticario'.
      </user_input>

      <fetch_inpi_data>
      marca: "boticario"
      </fetch_inpi_data>

      <tool_response>
      result_id: "boticario-fetch-xyz"
      summary: "Found 50 trademark(s)."
      </tool_response>

      <user_input>
      What is the most recent registration for them?
      </user_input>
    "#
  }
  // LLM should now decide to use the find_most_recent_trademark tool
  @@assert(intent_match, {{this.intent == "find_most_recent_trademark"}})
  @@assert(result_id_used, {{this.result_id == "boticario-fetch-xyz"}})
}

// Test case to ensure the LLM selects the correct initial tool.
test Inpi_Step1_InitialFetch {
  functions [DetermineNextStep] // Assumes DetermineNextStep is the main agent function
  args {
    thread #"
      <user_input>
      Can you search the Brazilian trademark database for 'nubank'?
      </user_input>
    "#
  }
  @@assert(intent_match, {{this.intent == "fetch_inpi_data"}})
  @@assert(marca_extraction, {{this.marca == "nubank"}})
}

// Test case for the filtering step after a successful fetch.
test Inpi_Step2_FilterResults {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
      Can you search the Brazilian trademark database for 'nubank'?
      </user_input>

      <fetch_inpi_data> // Tool call made by LLM
      marca: "nubank"
      </fetch_inpi_data>

      <tool_response> // Response from the fetch tool handler
      result_id: "dummy-result-id-123" // This ID would be generated by the handler
      summary: "Found 29 trademark(s)."
      </tool_response>

      <user_input> // Follow-up question from user (or could be LLM deciding next step)
      Show me only the ones that are 'Deferido' (granted).
      </user_input>
    "#
  }
  // LLM should now decide to use the filter tool
  @@assert(intent_match, {{this.intent == "filter_inpi_results"}})
  @@assert(result_id_used, {{this.result_id == "dummy-result-id-123"}})
  @@assert(filter_criteria, {{this.situacao == "Deferido"}})
}

// Test case for getting specific details after a successful fetch.
test Inpi_Step3_GetDetails {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
      Find the INPI record for 'banco inter'.
      </user_input>

      <fetch_inpi_data>
      marca: "banco inter"
      </fetch_inpi_data>

      <tool_response>
      result_id: "dummy-result-id-456"
      summary: "Found 15 trademark(s)."
      </tool_response>

      <user_input>
      What are the details for number 987654321?
      </user_input>
    "#
  }
  // LLM should decide to use the get details tool
  @@assert(intent_match, {{this.intent == "get_inpi_details"}})
  @@assert(result_id_used, {{this.result_id == "dummy-result-id-456"}})
  @@assert(numero_match, {{this.numero == "987654321"}})
}

// Test case where the LLM needs to filter by owner after fetching.
test Inpi_MultiStep_FilterByOwner {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
      Search INPI for 'natura'.
      </user_input>

      <fetch_inpi_data>
      marca: "natura"
      </fetch_inpi_data>

      <tool_response>
      result_id: "natura-fetch-id"
      summary: "Found 150 trademark(s)."
      </tool_response>

      <user_input>
      Which of those belong to Natura Cosméticos S.A.?
      </user_input>
    "#
  }
  @@assert(intent_match, {{this.intent == "filter_inpi_results"}})
  @@assert(result_id_used, {{this.result_id == "natura-fetch-id"}})
  @@assert(filter_criteria, {{this.titular == "Natura Cosméticos S.A."}})
}