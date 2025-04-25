type CalculatorTools = AddTool | SubtractTool | MultiplyTool | DivideTool


class AddTool {
    intent "add"
    a int | float
    b int | float
}

class SubtractTool {
    intent "subtract"
    a int | float
    b int | float
}

class MultiplyTool {
    intent "multiply"
    a int | float
    b int | float
}

class DivideTool {
    intent "divide"
    a int | float
    b int | float
}


test MathOperation {
  functions [DetermineNextStep]
  args {
    thread #"
      <user_input>
        can you multiply 3 and 4?
      </user_input>
    "#
  }
  @@assert(intent, {{this.intent == "multiply"}})
}

test LongMath {
  functions [DetermineNextStep]
  args {
    thread #"
         <user_input>
    can you multiply 3 and 4, then divide the result by 2 and then add 12 to that result?
    </user_input>


    <multiply>
    a: 3
    b: 4
    </multiply>


    <tool_response>
    12
    </tool_response>


    <divide>
    a: 12
    b: 2
    </divide>


    <tool_response>
    6
    </tool_response>


    <add>
    a: 6
    b: 12
    </add>


    <tool_response>
    18
    </tool_response>

    "#
  }
  @@assert(intent, {{this.intent == "done_for_now"}})
  @@assert(answer, {{"18" in this.message}})
}



test MathOperationWithClarification {
  functions [DetermineNextStep]
  args {
    thread #"
          <user_input>
          can you multiply 3 and fe1iiaff10
          </user_input>
      "#
  }
  @@assert(intent, {{this.intent == "request_more_information"}})
}

test MathOperationPostClarification {
  functions [DetermineNextStep]
  args {
    thread #"
        <user_input>
        can you multiply 3 and FD*(#F&& ?
        </user_input>

        <request_more_information>
        message: It seems like there was a typo or mistake in your request. Could you please clarify or provide the correct numbers you would like to multiply?
        </request_more_information>

        <human_response>
        lets try 12 instead
        </human_response>
      "#
  }
  @@assert(intent, {{this.intent == "multiply"}})
  @@assert(b, {{this.a == 3}})
  @@assert(a, {{this.b == 12}})
}
        