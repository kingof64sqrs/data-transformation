"""Azure OpenAI client for DataFusion Intelligence Platform."""

from __future__ import annotations

import json
import os
import logging

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Read from .env — supports both legacy names and the actual project names
AZURE_OPENAI_API_KEY = (
    os.getenv("GPT4OMINI_API_KEY")
    or os.getenv("AZURE_OPENAI_API_KEY", "")
)
AZURE_OPENAI_ENDPOINT = (
    os.getenv("GPT4OMINI_ENDPOINT")
    or os.getenv("AZURE_OPENAI_ENDPOINT", "")
)
AZURE_OPENAI_DEPLOYMENT = (
    os.getenv("GPT4OMINI_DEPLOYMENT_NAME")
    or os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
)
AZURE_OPENAI_API_VERSION = (
    os.getenv("GPT4OMINI_API_VERSION")
    or os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
)


def is_ai_configured() -> bool:
    """Check if Azure OpenAI credentials are configured."""
    return bool(AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT)


async def call_gpt4(system_prompt: str, user_message: str, max_tokens: int = 1000) -> str:
    """Call Azure OpenAI GPT-4o-mini and return raw text response."""
    if not is_ai_configured():
        raise ValueError(
            "Azure OpenAI not configured. Ensure GPT4OMINI_API_KEY and "
            "GPT4OMINI_ENDPOINT are set in your .env file."
        )

    # Strip trailing slash, build URL
    endpoint = AZURE_OPENAI_ENDPOINT.rstrip("/")
    url = (
        f"{endpoint}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}"
        f"/chat/completions?api-version={AZURE_OPENAI_API_VERSION}"
    )

    headers = {
        "api-key": AZURE_OPENAI_API_KEY,
        "Content-Type": "application/json",
    }

    body = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def call_gpt4_json(system_prompt: str, user_message: str, max_tokens: int = 1000) -> dict:
    """Call Azure OpenAI and parse response as JSON."""
    raw = await call_gpt4(system_prompt, user_message, max_tokens)
    # Strip markdown code fences if present
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove opening ```json or ``` and closing ```
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[start:end])
    return json.loads(text)
