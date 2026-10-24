"""Pydantic validation for the frozen v1 Event envelope.

Envelope-invalid input -> 422 (never persisted). Referential conflicts
(parent, call ids, unmatched results) -> 409. Unknown tools / bad tool args
are valid envelopes and persist as findings.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EVENT_TYPES = ("user", "llm", "tool_call", "tool_result", "final")


class Tool(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1)
    args: dict[str, Any] = Field(default_factory=dict)


class EventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1"]
    run_id: str = Field(min_length=1)
    step_id: str = Field(min_length=1)
    parent_step_id: str | None = Field(min_length=1)
    agent: str = Field(min_length=1)
    type: Literal["user", "llm", "tool_call", "tool_result", "final"]
    content: str
    tool: Tool | None = None
    tool_call_id: str | None = Field(default=None, min_length=1)
    ts: str

    @field_validator("ts")
    @classmethod
    def _ts_is_utc_iso8601(cls, v: str) -> str:
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("ts must be ISO 8601")
        if dt.tzinfo is None or dt.utcoffset() != timedelta(0):
            raise ValueError("ts must be ISO 8601 UTC")
        return v

    @model_validator(mode="after")
    def _type_conditionals(self) -> "EventIn":
        if self.type == "tool_call":
            if self.tool is None:
                raise ValueError("tool is required for tool_call")
        elif self.tool is not None:
            raise ValueError("tool is only allowed for tool_call")
        if self.type in {"tool_call", "tool_result"}:
            if self.tool_call_id is None:
                raise ValueError(
                    f"tool_call_id is required for {self.type}"
                )
        elif self.tool_call_id is not None:
            raise ValueError(
                "tool_call_id is only allowed for tool_call/tool_result"
            )
        return self

    def normalized(self) -> dict[str, Any]:
        """Wire-shape dict: omitted optionals stay omitted."""
        data = self.model_dump(mode="json")
        for key in ("tool", "tool_call_id"):
            if data[key] is None:
                del data[key]
        return data
