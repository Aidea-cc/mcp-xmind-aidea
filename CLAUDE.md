# CLAUDE.md

## Build & Test / 构建与测试
- `npm run build` — compile TS (tsc) + chmod dist/*.js
- `npm test` — vitest run
- `npx @modelcontextprotocol/inspector node dist/index.js /path/to/xmind` — interactive MCP test

## Architecture / 架构
- Single file server: `index.ts` (root, no src/)
- Tests: `test/xmind-server.test.ts` with helpers in `test/helpers.ts`
- tsconfig: rootDir=`.`, outDir=`dist/`, excludes `test/` from build

## XMind Format / XMind 格式
- .xmind file = ZIP containing `content.json`, `metadata.json`, `manifest.json`, `content.xml`
- Topics require `class: "topic"`, sheets require `class: "sheet"` + `theme: {}`
- `attributedTitle: [{text: "..."}]` on all nodes for full format compatibility
- `content.xml` included for backward compatibility with XMind 8
- Planned tasks need `extensions` with `org.xmind.ui.working-day-settings` at sheet level
- `topicOverlapping: "overlap"` and `compactLayoutModeLevel: "Second"` at sheet level
- Notes HTML: `realHTML.content` (supported tags: `<strong>`, `<u>`, `<ul>`, `<ol>`, `<li>`, `<br>`)
- Internal links: `href: "xmind:#<topicId>"`

## Customizations / 自定义改造
- **Rainbow theme**: Full theme matching XMind desktop default (dark navy #000229 style)
- **Node classes**: `importantTopic` (bold, #460400), `minorTopic` (bold, #703D00)
- **metadata**: `dataStructureVersion: "2"`, creator: Vana/24.01.13311, layoutEngineVersion: "3"
- **Sheet extensions**: `org.xmind.ui.skeleton.structure.style` for central topic layout

## Patterns
- IDs generated via `crypto.randomUUID()` truncated to 26 chars without dashes
- Resolution by title (relationships, dependencies, linkToTopic): store title→id in Map, resolve after build
- TypeScript: use `NonNullable<T>` for accessing elements of optional arrays in interfaces

## Skill
- `skills/xmind/`: standalone skill for Claude Desktop (creation only, no reading)
- Script: `skills/xmind/scripts/create_xmind.mjs` — zero npm dependency (inline ZIP with `zlib.deflateRawSync`)
- Build: `cd skills/xmind && zip -r xmind-skill.zip SKILL.md scripts/`
