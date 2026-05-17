class ConflictReport:
    def __init__(self, courses: list[int], description: str, entries: list[int] = None):
        self.courses = courses
        self.entries = entries or []
        self.description = description

    def to_dict(self):
        return {"courses": self.courses, "entries": self.entries, "description": self.description}


class ConflictAuditor:
    def __init__(self, db, isCritical: bool):
        self.db = db
        self.isCritical = isCritical

    def Audit(self, term) -> list[ConflictReport]:
        return []
