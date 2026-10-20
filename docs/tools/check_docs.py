#!/usr/bin/env python3
"""Check documentation and assemble the ER reference. No application dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

DOCS = Path(__file__).resolve().parents[1]
PROJECT = DOCS.parent
MODULES = {
    "identity.md": ["USERS", "AUTH_IDENTITIES", "USER_CREDENTIALS", "WORKSPACE_MEMBERSHIPS", "AUTH_SESSIONS", "REFRESH_TOKENS"],
    "hierarchy.md": ["WORKSPACES", "CONTAINERS"],
    "permissions.md": ["CONTAINER_GRANTS"],
    "statuses.md": ["STATUS_SETS", "STATUSES"],
    "custom-fields.md": ["CUSTOM_FIELD_DEFINITIONS", "CUSTOM_FIELD_OPTIONS"],
    "tasks.md": ["TASKS", "TASK_ASSIGNEES", "TASK_FIELD_VALUES"],
    "workflows.md": [],
    "persistence-runtime.md": [],
    "web-client.md": [],
    "api-contracts.md": [],
}
SECTIONS = [
    "## 1. Purpose and example",
    "## 2. Ownership, data, and decisions",
    "## 3. Connections and interfaces",
    "## 4. Workflows and sequence diagrams",
    "## 5. Build phases, failure cases, and change guide",
]
AUTH_COLUMNS = {
    "USERS": {"id", "display_name", "is_active", "created_at", "updated_at"},
    "AUTH_IDENTITIES": {"id", "user_id", "issuer", "subject"},
    "USER_CREDENTIALS": {"user_id", "login_identifier", "password_hash", "password_changed_at"},
    "WORKSPACE_MEMBERSHIPS": {"workspace_id", "user_id", "role", "is_active"},
    "AUTH_SESSIONS": {"id", "user_id", "auth_identity_id", "created_at", "expires_at", "revoked_at"},
    "REFRESH_TOKENS": {"id", "session_id", "parent_token_id", "token_hash", "created_at", "expires_at", "consumed_at"},
    "WORKSPACES": {"id", "name"},
}
EXPECTED_CASES = {"AUTH": 15, "HIER": 8, "PERM": 10, "STATUS": 10, "FIELD": 10, "TASK": 10, "FLOW": 9, "RUN": 9, "WEB": 10, "API": 8}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_schema():
    definitions, columns, owners, relationships, case_ids = {}, {}, {}, [], []
    for filename, expected in MODULES.items():
        path = DOCS / "modules" / filename
        text = path.read_text()
        for section in SECTIONS:
            require(section in text, f"{path.name}: missing section {section}")
        require(re.search(r"^Status: (planned\.|Day \d+ .*implemented;)", text, re.M), f"{path.name}: implementation status must be explicit")
        require("```mermaid\nflowchart" in text, f"{path.name}: missing workflow diagram")
        require("```mermaid\nsequenceDiagram" in text, f"{path.name}: missing sequence diagram")
        case_ids.extend(re.findall(r"^\| ([A-Z]+-\d{2}) \|", text, re.M))
        blocks = re.findall(r"<!-- schema:start -->\s*```mermaid\n(.*?)\n```\s*<!-- schema:end -->", text, re.S)
        require(len(blocks) == (1 if expected else 0), f"{path.name}: unexpected owned schema count")
        found = []
        if not blocks:
            continue
        block = blocks[0]
        for match in re.finditer(r"^    ([A-Z_]+) \{\n(.*?)^    \}", block, re.M | re.S):
            table, body = match.group(1), match.group(2)
            require(table not in definitions, f"Duplicate owned table definition: {table}")
            fields = re.findall(r"^        (\w+) (\w+)([^\n]*)$", body, re.M)
            require(bool(fields), f"Empty table definition: {table}")
            names = [field for _, field, _ in fields]
            require(len(names) == len(set(names)), f"Duplicate column in {table}")
            definitions[table] = match.group(0)
            columns[table] = {field: (kind, keys) for kind, field, keys in fields}
            owners[table] = filename
            found.append(table)
        require(set(found) == set(expected), f"{path.name}: ownership differs: {set(found) ^ set(expected)}")
        for line in block.splitlines():
            match = re.match(r"^    ([A-Z_]+)\s+([|o}{.\-]+)\s+([A-Z_]+)\s*:\s*(.+)$", line)
            if match and line not in relationships:
                relationships.append(line)
    require(len(definitions) == 16, f"Expected 16 business tables, got {len(definitions)}")
    for line in relationships:
        table_names = re.match(r"^    ([A-Z_]+)\s+\S+\s+([A-Z_]+)", line)
        require(all(name in definitions for name in table_names.groups()), f"Unknown related table: {line}")
    for table, expected in AUTH_COLUMNS.items():
        require(set(columns[table]) == expected, f"Protected reference fields changed in {table}: {set(columns[table]) ^ expected}")
    require("PK, FK" in columns["USER_CREDENTIALS"]["user_id"][1], "Credential user_id must be PK/FK")
    require("    USERS ||--o| USER_CREDENTIALS : optionally_has_local_password" in relationships, "Missing direct user-to-credential relationship")
    require(not any("AUTH_IDENTITIES" in line and "USER_CREDENTIALS" in line for line in relationships), "Credentials must not be owned by auth identity")
    require(len(case_ids) == len(set(case_ids)), "Duplicate module test TODO ID")
    for prefix, count in EXPECTED_CASES.items():
        actual = {case for case in case_ids if case.startswith(prefix + "-")}
        expected = {f"{prefix}-{index:02}" for index in range(1, count + 1)}
        require(actual == expected, f"Unexpected TODO IDs for {prefix}: {actual ^ expected}")
    identity = (DOCS / "modules/identity.md").read_text()
    require("Both methods resolve" in identity or "same session/token service" in identity, "Missing common sign-in boundary")
    require("Do not throw an exception that rolls back replay revocation" in identity, "Missing replay commit safeguard")
    require("Provider tokens do not become business API credentials" in (DOCS / "adr/0004-authentication.md").read_text(), "Missing provider-token boundary")
    return definitions, columns, owners, relationships, case_ids


def render_er(definitions, owners, relationships):
    groups = [
        ("1. Identity, credentials, sessions, and membership", ["USERS", "AUTH_IDENTITIES", "USER_CREDENTIALS", "AUTH_SESSIONS", "REFRESH_TOKENS", "WORKSPACES", "WORKSPACE_MEMBERSHIPS"]),
        ("2. Hierarchy, permissions, and configuration", ["WORKSPACES", "WORKSPACE_MEMBERSHIPS", "CONTAINERS", "CONTAINER_GRANTS", "STATUS_SETS", "STATUSES", "CUSTOM_FIELD_DEFINITIONS", "CUSTOM_FIELD_OPTIONS"]),
        ("3. Tasks, assignments, and custom values", ["WORKSPACES", "CONTAINERS", "USERS", "WORKSPACE_MEMBERSHIPS", "TASKS", "TASK_ASSIGNEES", "CUSTOM_FIELD_DEFINITIONS", "TASK_FIELD_VALUES"]),
    ]
    output = [
        "# Complete Flowboard ER reference",
        "",
        "Generated from the owned schema blocks in the module guides. Do not edit columns here independently.",
        "",
        "Status: schema reference for the implemented Day 1 foundation and planned later phases. [Hub](README.md) | [Architecture](architecture.md) | [Business example](business-walkthrough.md)",
        "",
        "Refresh with `python3 docs/tools/check_docs.py --write`; check with `python3 docs/tools/check_docs.py --check`.",
        "",
        "The three views describe the same 16 tables; repeated boxes are the same entities. PK means primary key, FK foreign key, and UK unique key. A one-to-many line means one parent can have many child rows. Optional relationships can have no child or no referenced parent as labeled. Shared configuration validity is also checked by application workflows, not only foreign keys.",
        "",
    ]
    for heading, names in groups:
        selected = set(names)
        lines = []
        for line in relationships:
            pair = re.match(r"^    ([A-Z_]+)\s+\S+\s+([A-Z_]+)", line).groups()
            if set(pair) <= selected:
                lines.append(line)
        output.extend([f"## {heading}", "", "```mermaid", "erDiagram", *lines, ""])
        output.append("\n\n".join(definitions[name] for name in names))
        output.extend(["```", ""])
    output.extend(["## Table owners", "", "| Table | Single owning guide |", "| --- | --- |"])
    for table, owner in owners.items():
        output.append(f"| {table} | [{owner.removesuffix('.md')}](modules/{owner}) |")
    output.extend([
        "", "## Business rules that are not simple foreign keys", "",
        "| Rule | Owner |", "| --- | --- |",
        "| A task's container must be a list and its ancestry active. | [Hierarchy](modules/hierarchy.md) and [workflows](modules/workflows.md) |",
        "| Task status_key must belong to its list's resolved set; there is no direct global status FK. | [Statuses](modules/statuses.md) |",
        "| JSONB answers must match effective types, required rules, and option IDs. | [Custom fields](modules/custom-fields.md) |",
        "| A session's user and authenticating identity must match; credentials belong directly to the user. | [Identity](modules/identity.md) |",
        "| Session revoked_at is the refresh-family revocation source; token rows have no revoked_at. | [Identity](modules/identity.md) |",
        "| Moves and config edits validate every affected retained record before a single commit. | [Workflows](modules/workflows.md) |",
        "", "Migration history and seed-version bookkeeping are infrastructure metadata, not extra business tables.", "",
    ])
    return "\n".join(output)


def check_dependencies():
    text = (DOCS / "architecture.md").read_text()
    match = re.search(r"<!-- dependency-policy:start -->\s*```json\n(.*?)\n```\s*<!-- dependency-policy:end -->", text, re.S)
    require(match is not None, "Missing dependency policy")
    graph = json.loads(match.group(1))
    visiting, complete = set(), set()

    def visit(node):
        require(node in graph, f"Unknown dependency: {node}")
        require(node not in visiting, f"Dependency cycle through {node}")
        if node in complete:
            return
        visiting.add(node)
        for target in graph[node]:
            visit(target)
        visiting.remove(node)
        complete.add(node)

    for node in graph:
        visit(node)
    require(graph["web"] == ["contracts"], "Web must not import backend libraries")
    require(not graph["contracts"] and not graph["persistence"], "Infrastructure/contracts must not import domains")
    return len(graph)


def slug(text):
    text = re.sub(r"[`*_]", "", text).lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def check_markdown():
    files = list(DOCS.rglob("*.md")) + [PROJECT / "AGENTS.md"]
    diagrams = links = 0
    for path in files:
        text = path.read_text()
        require(len(re.findall(r"^```", text, re.M)) % 2 == 0, f"Unbalanced code fence: {path}")
        diagrams += len(re.findall(r"^```mermaid$", text, re.M))
        # Fenced examples are not live document links.
        prose = re.sub(r"^```[^\n]*\n.*?^```\s*$", "", text, flags=re.M | re.S)
        for raw in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", prose):
            target = raw.strip().strip("<>")
            if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target):
                continue
            filename, _, fragment = unquote(target).partition("#")
            destination = (path.parent / filename).resolve() if filename else path
            require(destination.exists(), f"Broken link in {path.relative_to(PROJECT)}: {target}")
            if fragment and destination.suffix == ".md":
                contents = destination.read_text()
                anchors = {slug(value) for value in re.findall(r"^#{1,6} (.+)$", contents, re.M)}
                anchors.update(re.findall(r'id="([^"]+)"', contents))
                require(fragment in anchors, f"Missing anchor in {path}: {target}")
            links += 1
    return len(files), diagrams, links


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--write", action="store_true", help="refresh derived ER, then check docs")
    action.add_argument("--check", action="store_true", help="read-only consistency check (default)")
    args = parser.parse_args()
    definitions, columns, owners, relationships, case_ids = read_schema()
    expected = render_er(definitions, owners, relationships)
    target = DOCS / "er-diagram.md"
    if args.write:
        target.write_text(expected)
    require(target.exists() and target.read_text() == expected, "Derived ER is stale; run python3 docs/tools/check_docs.py --write")
    nodes = check_dependencies()
    files, diagrams, links = check_markdown()
    print(f"Documentation OK: {len(MODULES)} modules, {len(definitions)} owned business tables, {len(case_ids)} application-test TODOs.")
    print(f"Checked {files} Markdown files, {diagrams} Mermaid blocks, {links} local links, and an acyclic {nodes}-project dependency policy.")
    print("Protected authentication reference fields and credential ownership match. Application tests were not implemented or run.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f"Documentation check failed: {error}", file=sys.stderr)
        sys.exit(1)
