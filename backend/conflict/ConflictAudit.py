class ConflictReport:
    def __init__(self, courses: list[int], description: str):
        self.courses = courses
        self.description = description

    def to_dict(self):
        return {"courses": self.courses, "description": self.description}


class ConflictAuditor:
    def __init__(self, db, isCritical: bool):
        self.db = db
        self.isCritical = isCritical

    def Audit(self, term) -> list[ConflictReport]:
        return []
