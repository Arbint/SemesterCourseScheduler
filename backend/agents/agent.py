from anthropic import Anthropic
import json
from agents.utilities import GetAPIKey

class Agent:
    def __init__(self, name, description, properties, system, userInput="", maxIter=10):
        self.name = name
        self.description = description
        self.properties = properties
        self.system = system
        self.messages = []
        self.model = "claude-sonnet-4-6"
        self.maxTokens = 1024
        if userInput:
            self.messages.append({"role":"user", "content": userInput})

        self.maxIter = maxIter
        self.subAgents = {}
        self.lastTrace = []

        self.client = Anthropic(api_key=GetAPIKey())


    def ProcessNewUserInput(self, userInput):
        self.messages.append({"role":"user", "content": userInput})
        return self.Run()


    def ProcessNewUserInputStream(self, userInput):
        """Generator variant of ProcessNewUserInput: yields each trace step
        (interim text / tool call) as it happens, ending with a {"type": "final", ...}
        event, instead of only returning the finished answer at the end."""
        self.messages.append({"role": "user", "content": userInput})
        yield from self._RunSteps()


    @staticmethod
    def _blocks_to_dicts(content) -> list[dict]:
        """Convert SDK content block objects to plain dicts for safe re-serialization."""
        result = []
        for block in content:
            if isinstance(block, dict):
                result.append(block)
            elif block.type == "text":
                result.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                result.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
        return result

    def Run(self):
        finalResponse = "no response"
        for event in self._RunSteps():
            if event["type"] == "final":
                finalResponse = event["text"]
        return finalResponse


    def _RunSteps(self):
        """Core agent loop as a generator: yields each trace step (interim
        text, then each tool call) the moment it happens, so a streaming
        caller can surface it live instead of waiting for the whole turn to
        finish. Always ends with exactly one {"type": "final", "text": ...}."""
        iter = 0
        response = None
        trace = []
        while iter < self.maxIter:
            iter += 1

            print(f"\n------- Interation {iter} -------")
            self.__PrintContextWindow()

            response = self._SendRequestToAgent()

            toolUseBlocks = [block for block in response.content if block.type == "tool_use"]
            textBlocks = [block for block in response.content if block.type == "text"]

            for textBlock in textBlocks:
                print(f"assstant: {textBlock.text}")

            # Store as plain dicts so the SDK can serialize them reliably on the next call
            self.messages.append({"role": "assistant", "content": self._blocks_to_dicts(response.content)})

            if toolUseBlocks:
                # Interim text in a turn that also calls tools is the model
                # "thinking out loud" before acting — record it as such. Text
                # in the final (no tool_use) turn is the answer itself, not trace.
                for textBlock in textBlocks:
                    if textBlock.text.strip():
                        step = {"type": "text", "text": textBlock.text}
                        trace.append(step)
                        yield step

                # Every tool_use block MUST get a matching tool_result in the
                # next message, or the next API call fails with a 400
                # (dangling tool_use). Catch tool errors here so one broken
                # tool can't corrupt the conversation history for the rest
                # of the session. All results are gathered before the next
                # message is appended — the API requires them together —
                # but each step is yielded to the caller as soon as it's done.
                toolResults = []
                for toolUseBlock in toolUseBlocks:
                    print(f"----> Calling: {toolUseBlock.name}")
                    print(f"args: {toolUseBlock.input}")

                    try:
                        result = self.__CallTool(toolName=toolUseBlock.name, **toolUseBlock.input)
                        content = json.dumps(result)
                        isError = False
                    except Exception as e:
                        print(f"----> Tool {toolUseBlock.name} raised: {e}")
                        content = json.dumps({"error": str(e)})
                        isError = True

                    toolResults.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": toolUseBlock.id,
                            "content": content,
                            **({"is_error": True} if isError else {}),
                        }
                    )

                    # The trace is for display, not for the API — cap very
                    # long results (e.g. the full course catalog) so a single
                    # step can't balloon the response.
                    traceResult = content
                    if len(traceResult) > 4000:
                        traceResult = traceResult[:4000] + f"... ({len(content)} chars total)"

                    step = {
                        "type": "tool_call",
                        "name": toolUseBlock.name,
                        "input": toolUseBlock.input,
                        "result": traceResult,
                        "is_error": isError,
                    }
                    trace.append(step)
                    yield step

                self.messages.append({"role": "user", "content": toolResults})
            else:
                break

        self.lastTrace = trace

        finalResponse = "".join(
            block.text for block in response.content if block.type == "text"
        )
        yield {"type": "final", "text": finalResponse or "no response"}


    def ConfigureInput(self, **inputs):
        pass

    def AddSubAgent(self, newAgent):
        self.subAgents[newAgent.name] = newAgent


    def GetTools(self):
        tools = self.GetAgentTools() + self.GetSubAgentAsTools()
        return tools


    def GetAgentTools(self):
        return []


    def GetSubAgentAsTools(self):
        tools = []
        for subAgent in self.subAgents.values():
            tools.append(subAgent.GetToolDescription())

        return tools


    def GetToolDescription(self):
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": self.properties
            }
        }


    def __CallTool(self, toolName, **toolInputs):
        method = getattr(self, toolName, None)
        if method:
            return method(**toolInputs)
        else:
            return self.__CallSubAgent(toolName, **toolInputs)


    def __CallSubAgent(self, agentName, **inputs):
        subAgent = self.subAgents.get(agentName, None)
        if subAgent:
            subAgent.ConfigureInput(**inputs)
            return subAgent.Run()


    def __PrintContextWindow(self):
        print(f"---- Context Window ({len(self.messages)+1} messages) ----")

        for tool in self.GetTools():
            params = list(tool["input_schema"].get("properties", {}).keys())
            required = tool["input_schema"].get("required", [])
            paramStr = ", ".join(f"{p}{'*' if p in required else '?'}" for p in params)
            print(f"[function call defination] {tool['name']}({paramStr}) - {tool['description']}")

        for msg in self.messages:
            role = msg["role"]
            content = msg["content"]

            if isinstance(content, str):
                print(f"[{role}]: {content}")
            elif isinstance(content, list):
                # All blocks are now plain dicts
                hasText = any(isinstance(b, dict) and b.get("type") == "text" for b in content)
                if not hasText:
                    print(f"[{role}]:")
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if btype == "text":
                        print(f"[{role}]: {block['text']}")
                    elif btype == "tool_use":
                        print(f" -> tool_use (id={block['id']}): {block['name']}({json.dumps(block['input'])})")
                    elif btype == "tool_result":
                        print(f"[{role} (tool_result id={block['tool_use_id']})]: {block['content']}")

        print(f"----\n")


    def _SendRequestToAgent(self):
        response = self.client.messages.create(
            model=self.model,
            max_tokens=self.maxTokens,
            system = self.system,
            messages = self.messages,
            tools = self.GetTools()
        )

        return response