from anthropic import Anthropic
import json
from utilities import GetAPIKey

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

        self.client = Anthropic(api_key=GetAPIKey())


    def ProcessNewUserInput(self, userInput):
        self.messages.append({"role":"user", "content": userInput})
        self.Run()


    def Run(self):
        iter = 0
        response = None
        while iter < self.maxIter:
            iter += 1

            print(f"\n------- Interation {iter} -------")
            self.__PrintContextWindow()

            response = self._SendRequestToAgent()

            toolUseBlocks =[block for block in response.content if block.type=="tool_use"]
            textBlocks = [block for block in response.content if block.type=="text"]

            for textBlock in textBlocks: 
                print(f"assstant: {textBlock.text}")

            self.messages.append({"role": "assistant", "content": response.content})

            if toolUseBlocks:
                toolResults = self.__ProcessToolUse(toolUseBlocks)
                self.messages.append({"role":"user", "content": toolResults})
            else:
                break

        finalResponseTextBlocks = [block for block in response.content if block.type=="text"]
        finalResponse = ""
        for textBlock in finalResponseTextBlocks:
            finalResponse += textBlock.text

        if finalResponse == "":
            finalResponse = "no response"

        return finalResponse
            

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
                hasText = any(not isinstance(block, dict) and block.type=="text" for block in content)
                if not hasText: 
                    print(f"[{role}]:")
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type")=="tool_result":
                            print(f"[{role} (tool_result id={block['tool_use_id']})]: {block['content']}")

                    else:
                        if block.type=="text":
                            print(f"[{role}]: {block.text}")
                        elif block.type=="tool_use":
                            print(f" -> tool_use (id={block.id}): {block.name}({json.dumps(block.input)})")

        print(f"----\n")
                    

    def __ProcessToolUse(self, toolUseBlocks):
        toolResults = []
        for toolUseBlock in toolUseBlocks: 
            print(f"----> Calling: {toolUseBlock.name}")
            print(f"args: {toolUseBlock.input}")

            result = self.__CallTool(toolName=toolUseBlock.name, **toolUseBlock.input)

            toolResults.append(
                {
                    "type": "tool_result",
                    "tool_use_id": toolUseBlock.id,
                    "content": json.dumps(result)
                }
            )

        return toolResults


    def _SendRequestToAgent(self):
        response = self.client.messages.create(
            model=self.model,
            max_tokens=self.maxTokens,
            system = self.system,
            messages = self.messages,
            tools = self.GetTools()
        )

        return response