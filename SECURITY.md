# Security Policy

## Scope

Athanor is a local desktop application. It does not run servers or transmit data externally. Security concerns are primarily around:

- Local file and database handling
- Electron IPC and preload bridge security
- Subprocess execution (agent runtimes)
- Markdown/YAML parsing and rendering

## Reporting a Vulnerability

If you discover a security issue, please open a [GitHub issue](https://github.com/kokistudios/athanor/issues/new).

If the vulnerability could be exploited before a fix is released, avoid including exploit details in the public issue. Describe the general nature of the problem and we'll coordinate privately.

## Supported Versions

Only the latest release is supported with security updates.
