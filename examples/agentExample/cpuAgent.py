from agent import Agent

class CPUAgent(Agent):
    def __init__(self):
        super().__init__(
            name="CPUAgent",
            description="Get available CPUs, optionally filtered by socket and price range",
            properties={
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
            system="You are a CPU specialist. When asked for CPUs, call GetAvailableCPUs with the provided filters and return the results."
        )

    def ConfigureInput(self, **inputs):
        socket = inputs.get("socket")
        priceMin = inputs.get("priceMin")
        priceMax = inputs.get("priceMax")

        parts = ["Get available CPUs"]
        if socket:
            parts.append(f"for socket {socket}")
        if priceMin is not None:
            parts.append(f"with minimum price ${priceMin}")
        if priceMax is not None:
            parts.append(f"with maximum price ${priceMax}")

        self.messages = [{"role": "user", "content": " ".join(parts)}]

    def GetAgentTools(self):
        return [
            {
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

    def GetAvailableCPUs(self, socket=None, priceMin=None, priceMax=None):
        cpus = {
            "Intel Core i9-14900K": {
                "architecture": "Raptor Lake Refresh",
                "socket": "LGA1700",
                "cores": {"performance": 8, "efficient": 16, "total": 24},
                "threads": 32,
                "base_clock_ghz": {"performance": 3.2, "efficient": 2.4},
                "boost_clock_ghz": 6.0,
                "cache": {"L2_mb": 32, "L3_mb": 36},
                "memory_type": "DDR5/DDR4",
                "memory_channels": 2,
                "tdp_w": 125,
                "max_tdp_w": 253,
                "price_usd": 549,
                "igpu": "Intel UHD Graphics 770",
            },
            "Intel Core i7-14700K": {
                "architecture": "Raptor Lake Refresh",
                "socket": "LGA1700",
                "cores": {"performance": 8, "efficient": 12, "total": 20},
                "threads": 28,
                "base_clock_ghz": {"performance": 3.4, "efficient": 2.5},
                "boost_clock_ghz": 5.6,
                "cache": {"L2_mb": 28, "L3_mb": 33},
                "memory_type": "DDR5/DDR4",
                "memory_channels": 2,
                "tdp_w": 125,
                "max_tdp_w": 253,
                "price_usd": 379,
                "igpu": "Intel UHD Graphics 770",
            },
            "Intel Core i5-14600K": {
                "architecture": "Raptor Lake Refresh",
                "socket": "LGA1700",
                "cores": {"performance": 6, "efficient": 8, "total": 14},
                "threads": 20,
                "base_clock_ghz": {"performance": 3.5, "efficient": 2.6},
                "boost_clock_ghz": 5.3,
                "cache": {"L2_mb": 20, "L3_mb": 24},
                "memory_type": "DDR5/DDR4",
                "memory_channels": 2,
                "tdp_w": 125,
                "max_tdp_w": 181,
                "price_usd": 299,
                "igpu": "Intel UHD Graphics 770",
            },
            "AMD Ryzen 9 7950X": {
                "architecture": "Zen 4",
                "socket": "AM5",
                "cores": {"total": 16},
                "threads": 32,
                "base_clock_ghz": 4.5,
                "boost_clock_ghz": 5.7,
                "cache": {"L2_mb": 16, "L3_mb": 64},
                "memory_type": "DDR5",
                "memory_channels": 2,
                "tdp_w": 170,
                "max_tdp_w": 230,
                "price_usd": 549,
                "igpu": "AMD Radeon Graphics (RDNA 2)",
            },
            "AMD Ryzen 7 7800X3D": {
                "architecture": "Zen 4 + 3D V-Cache",
                "socket": "AM5",
                "cores": {"total": 8},
                "threads": 16,
                "base_clock_ghz": 4.5,
                "boost_clock_ghz": 5.0,
                "cache": {"L2_mb": 8, "L3_mb": 96},
                "memory_type": "DDR5",
                "memory_channels": 2,
                "tdp_w": 120,
                "max_tdp_w": 162,
                "price_usd": 349,
                "igpu": "AMD Radeon Graphics (RDNA 2)",
            },
            "AMD Ryzen 5 7600X": {
                "architecture": "Zen 4",
                "socket": "AM5",
                "cores": {"total": 6},
                "threads": 12,
                "base_clock_ghz": 4.7,
                "boost_clock_ghz": 5.3,
                "cache": {"L2_mb": 6, "L3_mb": 32},
                "memory_type": "DDR5",
                "memory_channels": 2,
                "tdp_w": 105,
                "max_tdp_w": 142,
                "price_usd": 229,
                "igpu": "AMD Radeon Graphics (RDNA 2)",
            },
        }

        if socket is not None:
            cpus = {name: cpu for name, cpu in cpus.items() if cpu["socket"] == socket}
        if priceMin is not None:
            cpus = {name: cpu for name, cpu in cpus.items() if cpu["price_usd"] >= priceMin}
        if priceMax is not None:
            cpus = {name: cpu for name, cpu in cpus.items() if cpu["price_usd"] <= priceMax}

        return cpus
