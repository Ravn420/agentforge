"""Deep Research — Autonomous, Iterative Multi-Round Web Research Engine.

Based on the IterResearch paradigm (Think -> Search -> Extract -> Synthesize).
"""

from .service import ResearchService, ResearchResult, ResearchSource
from .engine import DeepResearcher
from .handler import ResearchHandler
from .visual_report import build_visual_report

__version__ = "1.0.0"
__all__ = [
    "ResearchService",
    "ResearchResult",
    "ResearchSource",
    "DeepResearcher",
    "ResearchHandler",
    "build_visual_report",
]
