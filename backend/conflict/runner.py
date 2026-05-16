import inspect
import importlib
import sys
from conflict.ConflictAudit import ConflictAuditor, ConflictReport


def get_all_auditors(db) -> list[ConflictAuditor]:
    import conflict.ConflictAuditors as auditors_module
    auditors = []
    for name, cls in inspect.getmembers(auditors_module, inspect.isclass):
        if issubclass(cls, ConflictAuditor) and cls is not ConflictAuditor:
            auditors.append(cls(db))
    return auditors


def run_audits(db, term) -> tuple[list[ConflictReport], list[ConflictReport]]:
    auditors = get_all_auditors(db)
    critical = []
    warnings = []
    for auditor in auditors:
        reports = auditor.Audit(term)
        if auditor.isCritical:
            critical.extend(reports)
        else:
            warnings.extend(reports)
    return critical, warnings
