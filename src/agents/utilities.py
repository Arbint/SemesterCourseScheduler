import os

def GetAPIKey():
    return os.environ.get("CLAUDE_API_KEY", default ="Not Found")
