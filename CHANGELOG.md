# Changelog

## [0.1.0] - 2026-04-23

### Added / 新增
- **首发版本**: mcp-xmind-aidea
- **Rainbow theme**: Full XMind desktop theme with dark navy style (#000229)
- **Node class types**: `topicClass` parameter supporting `importantTopic` and `minorTopic`
- **attributedTitle**: Automatically added to all nodes for full XMind format compatibility
- **content.xml**: Compatibility file to prevent warnings in XMind desktop
- **Sheet extensions**: `org.xmind.ui.skeleton.structure.style`
- **compactLayoutModeLevel**: Added `Second` level support
- **Relationship attributedTitle**: Added to relationship objects
- **Bilingual README**: Documentation in both English and Chinese

### Changed / 变更
- Forked from [mcp-xmind](https://github.com/apeyroux/mcp-xmind) by Alexandre Peyroux
- Renamed package to `mcp-xmind-aidea`
- `metadata.json`: Updated to `dataStructureVersion: "2"`, creator: "Vana"/"24.01.13311", `layoutEngineVersion: "3"`
- `manifest.json`: Includes `Thumbnails/thumbnail.png` entry

## [2.0.0] - 2025-01-18

### Breaking Changes
- Upgraded to MCP SDK v1.11.0 (from v0.5.0)
- Migrated from deprecated `Server` class to new `McpServer` API

### Added
- Output schemas (Zod) for structured tool responses
- Comprehensive unit test suite with vitest (25 tests)

## [1.0.0] - 2024-01-19

### Added
- Initial release of mcp-xmind by Alexandre Peyroux
