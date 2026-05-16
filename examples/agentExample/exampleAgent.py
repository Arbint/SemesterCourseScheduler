from agent import Agent

# this is just an examgle agent on build computers
from cpuAgent import CPUAgent

class MainUnitAgent(Agent):
    def __init__(self):
        # self, name, description, properties, system, userInput, maxIter=10
        super().__init__(
            name = "MainUnitAgent",
            description="Get a combination of the main unit of the computer",
            properties = {
                "price":{
                    "type":"integer",
                    "description":"the price limit"
                }
            },
            system = """you are an expert in compute DIY, specialied in the core components of the main unit:
                * CPU
                * Motherboard
                * CPU
                * GPU
                * Memory
                * Case
                * Hard Drive
                * Power Supply
                you will be asked to give recommendations to select the above components
            """
        )
        self.AddSubAgent(CPUAgent())


    def ConfigureInput(self, **inputs):
        priceLimit = inputs.get("price", 1000)
        self.messages.append({"role":"user", "content": f"any suggestions on getting a main unit under {priceLimit}"})


    def GetAgentTools(self):
        return [
            {
                "name": self.GetAvailableGPUs.__name__,
                "description": "get the available GPUs",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.GetAvailableMotherBoard.__name__,
                "description": "get the available motherboards",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.GetAvailableMemory.__name__,
                "description": "get the available memory (RAM) kits",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.GetAvailableCase.__name__,
                "description": "get the available PC cases",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.GetAvailableHardDrive.__name__,
                "description": "get the available hard drives and SSDs",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.GetAvailablePowerSupply.__name__,
                "description": "get the available power supply units",
                "input_schema": {"type": "object", "properties": {}}
            },
        ]


    def GetAvailableGPUs(self):
        return {
            "NVIDIA GeForce RTX 4090": {
                "architecture": "Ada Lovelace",
                "vram_gb": 24,
                "vram_type": "GDDR6X",
                "cuda_cores": 16384,
                "boost_clock_mhz": 2520,
                "tdp_w": 450,
                "pcie": "PCIe 4.0 x16",
                "outputs": ["3x DisplayPort 1.4a", "1x HDMI 2.1"],
                "price_usd": 1599,
            },
            "NVIDIA GeForce RTX 4080 Super": {
                "architecture": "Ada Lovelace",
                "vram_gb": 16,
                "vram_type": "GDDR6X",
                "cuda_cores": 10240,
                "boost_clock_mhz": 2550,
                "tdp_w": 320,
                "pcie": "PCIe 4.0 x16",
                "outputs": ["3x DisplayPort 1.4a", "1x HDMI 2.1"],
                "price_usd": 999,
            },
            "NVIDIA GeForce RTX 4070 Ti Super": {
                "architecture": "Ada Lovelace",
                "vram_gb": 16,
                "vram_type": "GDDR6X",
                "cuda_cores": 8448,
                "boost_clock_mhz": 2610,
                "tdp_w": 285,
                "pcie": "PCIe 4.0 x16",
                "outputs": ["3x DisplayPort 1.4a", "1x HDMI 2.1"],
                "price_usd": 799,
            },
            "NVIDIA GeForce RTX 4060": {
                "architecture": "Ada Lovelace",
                "vram_gb": 8,
                "vram_type": "GDDR6",
                "cuda_cores": 3072,
                "boost_clock_mhz": 2460,
                "tdp_w": 115,
                "pcie": "PCIe 4.0 x16",
                "outputs": ["3x DisplayPort 1.4a", "1x HDMI 2.1"],
                "price_usd": 299,
            },
            "AMD Radeon RX 7900 XTX": {
                "architecture": "RDNA 3",
                "vram_gb": 24,
                "vram_type": "GDDR6",
                "compute_units": 96,
                "boost_clock_mhz": 2500,
                "tdp_w": 355,
                "pcie": "PCIe 4.0 x16",
                "outputs": ["2x DisplayPort 2.1", "1x HDMI 2.1", "1x USB-C"],
                "price_usd": 999,
            },
            "AMD Radeon RX 7800 XT": {
                "architecture": "RDNA 3",
                "vram_gb": 16,
                "vram_type": "GDDR6",
                "compute_units": 60,
                "boost_clock_mhz": 2430,
                "tdp_w": 263,
                "pcie": "PCIe 4.0 x16",
                "outputs": ["2x DisplayPort 2.1", "1x HDMI 2.1", "1x USB-C"],
                "price_usd": 499,
            },
        }

    def GetAvailableMotherBoard(self):
        return {
            "ASUS ROG Maximus Z790 Hero": {
                "socket": "LGA1700",
                "chipset": "Intel Z790",
                "memory_type": "DDR5",
                "memory_slots": 4,
                "max_memory_gb": 128,
                "max_memory_speed_mhz": 7800,
                "form_factor": "ATX",
                "price_usd": 629,
            },
            "MSI MAG B650 Tomahawk WiFi": {
                "socket": "AM5",
                "chipset": "AMD B650",
                "memory_type": "DDR5",
                "memory_slots": 4,
                "max_memory_gb": 128,
                "max_memory_speed_mhz": 6600,
                "form_factor": "ATX",
                "price_usd": 229,
            },
            "Gigabyte B760M DS3H": {
                "socket": "LGA1700",
                "chipset": "Intel B760",
                "memory_type": "DDR4",
                "memory_slots": 4,
                "max_memory_gb": 128,
                "max_memory_speed_mhz": 3200,
                "form_factor": "Micro-ATX",
                "price_usd": 109,
            },
            "ASUS ProArt X670E Creator WiFi": {
                "socket": "AM5",
                "chipset": "AMD X670E",
                "memory_type": "DDR5",
                "memory_slots": 4,
                "max_memory_gb": 128,
                "max_memory_speed_mhz": 6400,
                "form_factor": "ATX",
                "price_usd": 549,
            },
        }

    @classmethod
    def GetAvailableMemory(self):
        return {
            "Corsair Vengeance DDR5-6000 32GB (2x16GB)": {
                "type": "DDR5",
                "capacity_gb": 32,
                "kit": "2x16GB",
                "speed_mhz": 6000,
                "cas_latency": 30,
                "voltage_v": 1.35,
                "form_factor": "DIMM",
                "price_usd": 109,
            },
            "G.Skill Trident Z5 DDR5-6400 64GB (2x32GB)": {
                "type": "DDR5",
                "capacity_gb": 64,
                "kit": "2x32GB",
                "speed_mhz": 6400,
                "cas_latency": 32,
                "voltage_v": 1.4,
                "form_factor": "DIMM",
                "price_usd": 189,
            },
            "Kingston Fury Beast DDR4-3200 32GB (2x16GB)": {
                "type": "DDR4",
                "capacity_gb": 32,
                "kit": "2x16GB",
                "speed_mhz": 3200,
                "cas_latency": 16,
                "voltage_v": 1.35,
                "form_factor": "DIMM",
                "price_usd": 64,
            },
            "Corsair Vengeance DDR4-3600 16GB (2x8GB)": {
                "type": "DDR4",
                "capacity_gb": 16,
                "kit": "2x8GB",
                "speed_mhz": 3600,
                "cas_latency": 18,
                "voltage_v": 1.35,
                "form_factor": "DIMM",
                "price_usd": 44,
            },
            "G.Skill Ripjaws V DDR4-3200 16GB (2x8GB)": {
                "type": "DDR4",
                "capacity_gb": 16,
                "kit": "2x8GB",
                "speed_mhz": 3200,
                "cas_latency": 16,
                "voltage_v": 1.35,
                "form_factor": "DIMM",
                "price_usd": 39,
            },
        }


    def GetAvailableCase(self):
        return {
            "Fractal Design Torrent": {
                "form_factor_support": ["ATX", "Micro-ATX", "Mini-ITX"],
                "color": "Black",
                "type": "Mid Tower",
                "included_fans": 2,
                "max_gpu_length_mm": 461,
                "max_cpu_cooler_height_mm": 188,
                "drive_bays": {"3_5_inch": 2, "2_5_inch": 4},
                "price_usd": 189,
            },
            "Lian Li PC-O11 Dynamic EVO": {
                "form_factor_support": ["ATX", "Micro-ATX", "Mini-ITX"],
                "color": "Black",
                "type": "Mid Tower",
                "included_fans": 0,
                "max_gpu_length_mm": 420,
                "max_cpu_cooler_height_mm": 167,
                "drive_bays": {"3_5_inch": 2, "2_5_inch": 4},
                "price_usd": 149,
            },
            "NZXT H510": {
                "form_factor_support": ["ATX", "Micro-ATX", "Mini-ITX"],
                "color": "Black/White",
                "type": "Mid Tower",
                "included_fans": 2,
                "max_gpu_length_mm": 381,
                "max_cpu_cooler_height_mm": 165,
                "drive_bays": {"3_5_inch": 2, "2_5_inch": 2},
                "price_usd": 79,
            },
            "Cooler Master MasterBox Q300L": {
                "form_factor_support": ["Micro-ATX", "Mini-ITX"],
                "color": "Black",
                "type": "Mini Tower",
                "included_fans": 1,
                "max_gpu_length_mm": 360,
                "max_cpu_cooler_height_mm": 157,
                "drive_bays": {"3_5_inch": 1, "2_5_inch": 2},
                "price_usd": 49,
            },
        }

    def GetAvailableHardDrive(self):
        return {
            "Samsung 990 Pro 2TB NVMe SSD": {
                "type": "NVMe SSD",
                "interface": "PCIe 4.0 x4 (M.2)",
                "capacity_gb": 2000,
                "sequential_read_mb_s": 7450,
                "sequential_write_mb_s": 6900,
                "form_factor": "M.2 2280",
                "price_usd": 159,
            },
            "WD Black SN850X 1TB NVMe SSD": {
                "type": "NVMe SSD",
                "interface": "PCIe 4.0 x4 (M.2)",
                "capacity_gb": 1000,
                "sequential_read_mb_s": 7300,
                "sequential_write_mb_s": 6600,
                "form_factor": "M.2 2280",
                "price_usd": 99,
            },
            "Crucial MX500 2TB SATA SSD": {
                "type": "SATA SSD",
                "interface": "SATA III",
                "capacity_gb": 2000,
                "sequential_read_mb_s": 560,
                "sequential_write_mb_s": 510,
                "form_factor": "2.5 inch",
                "price_usd": 99,
            },
            "Seagate Barracuda 4TB HDD": {
                "type": "HDD",
                "interface": "SATA III",
                "capacity_gb": 4000,
                "rpm": 5400,
                "cache_mb": 256,
                "sequential_read_mb_s": 190,
                "sequential_write_mb_s": 190,
                "form_factor": "3.5 inch",
                "price_usd": 79,
            },
            "WD Red Plus 8TB NAS HDD": {
                "type": "HDD",
                "interface": "SATA III",
                "capacity_gb": 8000,
                "rpm": 5640,
                "cache_mb": 256,
                "sequential_read_mb_s": 215,
                "sequential_write_mb_s": 215,
                "form_factor": "3.5 inch",
                "price_usd": 189,
            },
        }

    def GetAvailablePowerSupply(self):
        return {
            "Seasonic Focus GX-1000 1000W": {
                "wattage": 1000,
                "efficiency_rating": "80+ Gold",
                "modular": "Fully Modular",
                "atx_version": "ATX 3.0",
                "pcie_16pin_connectors": 2,
                "form_factor": "ATX",
                "price_usd": 189,
            },
            "Corsair RM850x 850W": {
                "wattage": 850,
                "efficiency_rating": "80+ Gold",
                "modular": "Fully Modular",
                "atx_version": "ATX 2.52",
                "pcie_16pin_connectors": 0,
                "pcie_8pin_connectors": 4,
                "form_factor": "ATX",
                "price_usd": 139,
            },
            "EVGA SuperNOVA 750 G6 750W": {
                "wattage": 750,
                "efficiency_rating": "80+ Gold",
                "modular": "Fully Modular",
                "atx_version": "ATX 2.52",
                "pcie_8pin_connectors": 4,
                "form_factor": "ATX",
                "price_usd": 109,
            },
            "be quiet! Pure Power 12 M 650W": {
                "wattage": 650,
                "efficiency_rating": "80+ Gold",
                "modular": "Semi Modular",
                "atx_version": "ATX 3.0",
                "pcie_16pin_connectors": 1,
                "form_factor": "ATX",
                "price_usd": 89,
            },
            "Cooler Master MWE Bronze 550W": {
                "wattage": 550,
                "efficiency_rating": "80+ Bronze",
                "modular": "Non-Modular",
                "atx_version": "ATX 2.52",
                "pcie_8pin_connectors": 2,
                "form_factor": "ATX",
                "price_usd": 49,
            },
        }
