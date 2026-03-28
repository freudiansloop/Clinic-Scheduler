# Antigravity Agent Directives & Guardrails

This file contains strict operational rules for the Google Antigravity agent working within this repository. You must adhere to these directives to prevent quota drain, infinite loops, and system environment corruption.

## 1. Python Environment Management (Strictly Miniconda)
**DO NOT use the system-wide Python installation for any execution or dependency management.** This project strictly relies on Miniconda to isolate dependencies.
* **Activation:** Before running any Python scripts, tests, or installations, you must verify you are in the correct Conda environment by running `conda info --envs` or explicitly activating the project environment using `conda activate <env_name>`.
* **Dependencies:** Prefer `conda install <package>` over `pip install <package>` whenever possible. If a package is only available via pip, ensure the Conda environment is fully activated before executing the pip command.
* **Virtual Environments:** Never create standard Python virtual environments (e.g., `python -m venv venv`). Always use `conda create` if a new environment is required, but ask for explicit user permission first.

## 2. Autonomous Execution & Anti-Looping Limits
To prevent "ghost drain" and endless debugging loops, your autonomous terminal execution is heavily restricted:
* **The Two-Strike Rule:** If you execute a terminal command, script, or test and it fails twice in a row, you must **STOP IMMEDIATELY**. Do not attempt a third fix. Present the error to the user and wait for manual intervention.
* **No Unprompted Testing:** Do not autonomously run entire test suites or build processes unless explicitly requested by the user.

## 3. Code Modification Boundaries
* **Destructive Actions:** Never delete files, classes, or functions exceeding 20 lines without generating a summary of the proposed deletion and waiting for user approval.
* **Refactoring:** Do not attempt to autonomously resolve linting warnings, formatting errors, or perform unsolicited codebase-wide refactoring. Stick strictly to the user's explicit prompt.
* **Code Diffs:** When proposing significant structural changes, present a brief explanation of the architecture changes before writing the full implementation.

## 4. Context Management
* **Read Limits:** Do not index or read the entire repository for minor bug fixes. Rely exclusively on the files explicitly linked by the user (using the `@` command) or limit your file-reading actions to the exact modules required for the task.
* **Stale Files:** Ignore any files labeled as `backup`, `old`, or appended with timestamps unless explicitly instructed to reference them.