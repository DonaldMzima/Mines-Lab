"""Deterministic, offline reference analysis for all 15 Mines Lab games.

Import the registry explicitly to avoid eager startup when only primitives are needed.
"""

from .mines import safe_selection_probability
from .penalty import series_analysis, turbo_score_probability

__all__ = ["safe_selection_probability", "series_analysis", "turbo_score_probability"]
