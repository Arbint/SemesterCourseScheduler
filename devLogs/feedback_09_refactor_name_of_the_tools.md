for the schedule_audit_agent.py, I notice that the name of the tools are harded coded string, if you take a look at examples/agentExample/cpuAgent.md, you can see how the code uses the name of the method by querying for the name directly:
```py
    def GetAgentTools(self):
        return [
            {
                # use the name of the method for the name of the tool.
                "name": self.GetAvailableCPUs.__name__,
                "description": "get the available CPUs",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "socket": {
                            "type": "string",
                            "description": "the socket of the CPU"
                        },
                        "priceMin": {
                            "type": "integer",
                            "description": "the minimum price of the CPU"
                        },
                        "priceMax": {
                            "type": "integer",
                            "description": "the maximum price of the CPU"
                        }
                    },
                    "required": [],
                    "additionalProperties": False
                }
            }
        ]
```

any concerns on why you are not doing it the same way, if not, can you do the same for schedule_audit_agent.py?