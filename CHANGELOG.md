# Changelog

## [2.1.1] - 2026-04-23

### Changed / 变更
- Forked from [mcp-xmind](https://github.com/apeyroux/mcp-xmind) by Alexandre Peyroux
- Renamed package to `mcp-xmind-aidea`

### Added / 新增
- **Rainbow theme**: Full XMind desktop theme with dark navy style (#000229), including centralTopic, mainTopic, subTopic, floatingTopic, summaryTopic, calloutTopic, importantTopic, minorTopic, expiredTopic, boundary, summary, and relationship styles
- **Node class types**: `topicClass` parameter supporting `importantTopic` (bold, dark red #460400) and `minorTopic` (bold, brown #703D00)
- **attributedTitle**: Automatically added to all nodes for full XMind format compatibility
- **content.xml**: Compatibility file included in generated .xmind files to prevent warnings in XMind desktop
- **Sheet extensions**: `org.xmind.ui.skeleton.structure.style` for central topic layout configuration
- **compactLayoutModeLevel**: Added `Second` level compact layout support
- **Relationship attributedTitle**: Added attributedTitle to relationship objects
- **Bilingual README**: Documentation available in both English and Chinese

### Changed / 变更
- `metadata.json`: Updated to `dataStructureVersion: "2"`, creator: "Vana"/"24.01.13311", `layoutEngineVersion: "3"` for maximum compatibility
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
