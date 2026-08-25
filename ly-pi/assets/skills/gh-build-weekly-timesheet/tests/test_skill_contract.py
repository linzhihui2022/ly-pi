"""Regression tests for the manual weekly timesheet skill contract."""

from __future__ import annotations

import unittest
from pathlib import Path


SKILL_PATH = Path(__file__).parent.parent / "SKILL.md"


class SkillContractTests(unittest.TestCase):
    def test_keeps_timesheet_allocation_rules_explicit(self) -> None:
        skill = SKILL_PATH.read_text(encoding="utf-8")

        for requirement in (
            "## 分配估算工时",
            "每日各条目的估算值必须按指定增量相加后精确等于该日目标",
            "无证据日期始终为 `NO_ACTIVITY | 0h`",
            "`UNASSIGNED` 单独参与当天总额分配",
            "`NO_ACTIVITY` 不进入票据总计表",
            "## 呈现结果",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, skill)

    def test_documents_fail_closed_collection_errors(self) -> None:
        skill = SKILL_PATH.read_text(encoding="utf-8")

        for requirement in (
            "缺少可验证的作者 login",
            "失败退出",
            "invalid JSON response",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, skill)

    def test_requires_deterministic_allocation_validation(self) -> None:
        skill = SKILL_PATH.read_text(encoding="utf-8")

        for requirement in (
            "validate_timesheet.py",
            "--evidence",
            "--allocation",
            "--increment",
            "--target-hours",
            "--target",
            '"entries"',
            '"ticket_totals"',
            "只有校验器输出 `Timesheet allocation is valid.` 后才可呈现结果。",
            "最终表格必须直接渲染该 JSON",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, skill)

    def test_describes_bilingual_output_as_optional(self) -> None:
        skill = SKILL_PATH.read_text(encoding="utf-8")

        self.assertIn("（按需）中英双语进度", skill)


if __name__ == "__main__":
    unittest.main()
