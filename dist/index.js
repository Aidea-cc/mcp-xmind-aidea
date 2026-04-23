#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import AdmZip from 'adm-zip';
// Command line argument parsing
const args = process.argv.slice(2);
// Store allowed directories in normalized form (empty = all paths allowed)
const allowedDirectories = args.map(dir => path.normalize(path.resolve(dir)).toLowerCase());
// Validate that all directories exist and are accessible
async function validateDirectories() {
    await Promise.all(args.map(async (dir) => {
        try {
            const stats = await fs.stat(dir);
            if (!stats.isDirectory()) {
                console.error(`Error: ${dir} is not a directory`);
                process.exit(1);
            }
        }
        catch (error) {
            console.error(`Error accessing directory ${dir}:`, error);
            process.exit(1);
        }
    }));
}
// Path validation helper
function isPathAllowed(filePath) {
    if (allowedDirectories.length === 0)
        return true;
    const normalizedPath = path.normalize(path.resolve(filePath)).toLowerCase();
    return allowedDirectories.some(dir => normalizedPath.startsWith(dir));
}
// Class XMindParser
class XMindParser {
    filePath;
    constructor(filePath) {
        const resolvedPath = path.resolve(filePath);
        if (!isPathAllowed(resolvedPath)) {
            throw new Error(`Access denied: ${filePath} is not in an allowed directory`);
        }
        this.filePath = resolvedPath;
    }
    async parse() {
        const contentJson = this.extractContentJson();
        return this.parseContentJson(contentJson);
    }
    extractContentJson() {
        try {
            const zip = new AdmZip(this.filePath);
            const contentEntry = zip.getEntry("content.json");
            if (!contentEntry) {
                throw new Error("content.json not found in XMind file");
            }
            return zip.readAsText(contentEntry);
        }
        catch (error) {
            throw new Error(`Failed to extract content.json: ${error}`);
        }
    }
    parseContentJson(jsonContent) {
        try {
            const content = JSON.parse(jsonContent);
            const allNodes = content.map((sheet) => {
                const rootNode = this.processNode(sheet.rootTopic, sheet.title || "Untitled Map");
                // Add relationships to root node
                if (sheet.relationships) {
                    rootNode.relationships = sheet.relationships;
                }
                return rootNode;
            });
            return allNodes;
        }
        catch (error) {
            throw new Error(`Failed to parse JSON content: ${error}`);
        }
    }
    processNode(node, sheetTitle) {
        const processedNode = {
            title: node.title,
            id: node.id,
            sheetTitle: sheetTitle || "Untitled Map"
        };
        // Handle structure class
        if (node.structureClass)
            processedNode.structureClass = node.structureClass;
        // Handle links, labels and callouts
        if (node.href)
            processedNode.href = node.href;
        if (node.labels)
            processedNode.labels = node.labels;
        if (node.children?.callout) {
            processedNode.callouts = node.children.callout.map(callout => ({
                title: callout.title
            }));
        }
        // Handle notes (plain + optional HTML)
        if (node.notes?.plain?.content || node.notes?.realHTML?.content) {
            processedNode.notes = {};
            if (node.notes?.plain?.content)
                processedNode.notes.content = node.notes.plain.content;
            if (node.notes?.realHTML?.content)
                processedNode.notes.html = node.notes.realHTML.content;
        }
        // Handle markers
        if (node.markers && node.markers.length > 0) {
            processedNode.markers = node.markers.map(m => m.markerId);
        }
        // Handle boundaries
        if (node.boundaries && node.boundaries.length > 0) {
            processedNode.boundaries = node.boundaries;
        }
        // Handle summaries
        if (node.summaries && node.summaries.length > 0) {
            processedNode.summaries = node.summaries.map(s => {
                const entry = {
                    id: s.id,
                    range: s.range,
                    topicId: s.topicId,
                };
                // Find the summary topic title
                if (node.summary) {
                    const summaryTopic = node.summary.find(st => st.id === s.topicId);
                    if (summaryTopic)
                        entry.topicTitle = summaryTopic.title;
                }
                return entry;
            });
        }
        // Handle task extension (status, progress, priority, dates)
        if (node.extensions) {
            const taskExtension = node.extensions.find((ext) => ext.provider === 'org.xmind.ui.task');
            if (taskExtension) {
                const c = taskExtension.content;
                if (c.status)
                    processedNode.taskStatus = c.status;
                if (c.progress !== undefined)
                    processedNode.progress = c.progress;
                if (c.priority !== undefined)
                    processedNode.priority = c.priority;
                if (c.duration !== undefined)
                    processedNode.duration = c.duration;
                if (c.start !== undefined)
                    processedNode.startDate = new Date(c.start).toISOString();
                if (c.due !== undefined)
                    processedNode.dueDate = new Date(c.due).toISOString();
                if (c.dependencies && c.dependencies.length > 0)
                    processedNode.dependencies = c.dependencies;
            }
        }
        // Process regular children
        if (node.children?.attached) {
            processedNode.children = node.children.attached.map(child => this.processNode(child, sheetTitle));
        }
        return processedNode;
    }
}
function getNodePath(node, parents = []) {
    return parents.length > 0 ? `${parents.join(' > ')} > ${node.title}` : node.title;
}
// Schema definitions for tool inputs
const ReadXMindArgsSchema = z.object({
    path: z.string().describe("Path to the .xmind file"),
});
const ListXMindDirectoryArgsSchema = z.object({
    directory: z.string().optional().describe("Directory to scan (defaults to all allowed directories)"),
});
const ReadMultipleXMindArgsSchema = z.object({
    paths: z.array(z.string()).describe("Array of paths to .xmind files"),
});
const SearchXMindFilesSchema = z.object({
    pattern: z.string().describe("Search pattern to match in file names or content"),
    directory: z.string().optional().describe("Starting directory for search"),
});
const ExtractNodeArgsSchema = z.object({
    path: z.string().describe("Path to the .xmind file"),
    searchQuery: z.string().describe("Text to search in node paths (flexible matching)"),
});
const ExtractNodeByIdArgsSchema = z.object({
    path: z.string().describe("Path to the .xmind file"),
    nodeId: z.string().describe("Unique identifier of the node"),
});
const SearchNodesArgsSchema = z.object({
    path: z.string().describe("Path to the .xmind file"),
    query: z.string().describe("Search text"),
    searchIn: z.array(z.enum(['title', 'notes', 'labels', 'callouts', 'tasks'])).optional()
        .describe("Fields to search in"),
    caseSensitive: z.boolean().optional().describe("Whether search is case-sensitive"),
    taskStatus: z.enum(['todo', 'done']).optional().describe("Filter by task status"),
});
// Output Schema definitions
const XMindNodeSchema = z.lazy(() => z.object({
    title: z.string(),
    id: z.string().optional(),
    structureClass: z.string().optional(),
    children: z.array(XMindNodeSchema).optional(),
    taskStatus: z.enum(['done', 'todo']).optional(),
    progress: z.number().optional(),
    priority: z.number().optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    duration: z.number().optional(),
    markers: z.array(z.string()).optional(),
    notes: z.object({
        content: z.string().optional(),
        html: z.string().optional(),
    }).optional(),
    href: z.string().optional(),
    labels: z.array(z.string()).optional(),
    sheetTitle: z.string().optional(),
    callouts: z.array(z.object({
        title: z.string(),
    })).optional(),
    boundaries: z.array(z.object({
        id: z.string(),
        range: z.string(),
        title: z.string().optional(),
    })).optional(),
    summaries: z.array(z.object({
        id: z.string(),
        range: z.string(),
        topicId: z.string(),
        topicTitle: z.string().optional(),
    })).optional(),
    relationships: z.array(z.object({
        id: z.string(),
        end1Id: z.string(),
        end2Id: z.string(),
        title: z.string().optional(),
    })).optional(),
}));
const NodeMatchSchema = z.object({
    id: z.string(),
    title: z.string(),
    path: z.string(),
    sheet: z.string(),
    matchedIn: z.array(z.string()),
    notes: z.string().optional(),
    labels: z.array(z.string()).optional(),
    callouts: z.array(z.object({ title: z.string() })).optional(),
    taskStatus: z.enum(['todo', 'done']).optional(),
});
const FuzzyMatchResultSchema = z.object({
    node: XMindNodeSchema,
    matchConfidence: z.number(),
    path: z.string(),
});
// Helper functions
async function readMultipleXMindFiles(paths) {
    const results = [];
    for (const filePath of paths) {
        if (!isPathAllowed(filePath)) {
            results.push({
                filePath,
                content: [],
                error: `Access denied: ${filePath} is not in an allowed directory`
            });
            continue;
        }
        try {
            const parser = new XMindParser(filePath);
            const content = await parser.parse();
            results.push({ filePath, content });
        }
        catch (error) {
            results.push({
                filePath,
                content: [],
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    return results;
}
async function listXMindFiles(directory) {
    const files = [];
    const dirsToScan = directory
        ? [path.normalize(path.resolve(directory))]
        : allowedDirectories.length > 0 ? allowedDirectories : [path.normalize(path.resolve('.'))];
    for (const dir of dirsToScan) {
        if (allowedDirectories.length > 0) {
            const normalizedDir = dir.toLowerCase();
            if (!allowedDirectories.some(allowed => normalizedDir.startsWith(allowed))) {
                continue;
            }
        }
        async function scanDirectory(currentDir) {
            try {
                const entries = await fs.readdir(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    if (entry.isDirectory()) {
                        await scanDirectory(fullPath);
                    }
                    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xmind')) {
                        files.push(fullPath);
                    }
                }
            }
            catch (error) {
                console.error(`Warning: Error scanning directory ${currentDir}:`, error);
            }
        }
        await scanDirectory(dir);
    }
    return files;
}
async function searchInXMindContent(filePath, searchText) {
    try {
        const zip = new AdmZip(filePath);
        const contentEntry = zip.getEntry("content.json");
        if (!contentEntry)
            return false;
        const content = zip.readAsText(contentEntry);
        return content.toLowerCase().includes(searchText.toLowerCase());
    }
    catch (error) {
        console.error(`Error reading XMind file ${filePath}:`, error);
        return false;
    }
}
async function searchXMindFiles(pattern) {
    const matches = [];
    const contentMatches = [];
    const searchPattern = pattern.toLowerCase();
    async function searchInDirectory(currentDir) {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    const normalizedPath = path.normalize(fullPath).toLowerCase();
                    if (allowedDirectories.some(allowed => normalizedPath.startsWith(allowed))) {
                        await searchInDirectory(fullPath);
                    }
                }
                else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xmind')) {
                    const searchableText = [
                        entry.name.toLowerCase(),
                        path.basename(entry.name, '.xmind').toLowerCase(),
                        fullPath.toLowerCase()
                    ];
                    if (searchPattern === '' ||
                        searchableText.some(text => text.includes(searchPattern))) {
                        matches.push(fullPath);
                    }
                    else {
                        if (await searchInXMindContent(fullPath, searchPattern)) {
                            contentMatches.push(fullPath);
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error(`Warning: Error searching directory ${currentDir}:`, error);
        }
    }
    await Promise.all(allowedDirectories.map(dir => searchInDirectory(dir)));
    const allMatches = [
        ...matches.sort((a, b) => path.basename(a).localeCompare(path.basename(b))),
        ...contentMatches.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
    ];
    return allMatches;
}
function findNodeByPath(node, searchPath) {
    if (searchPath.length === 0 || !searchPath[0]) {
        return { found: true, node };
    }
    const currentSearch = searchPath[0].toLowerCase();
    if (!node.children) {
        return {
            found: false,
            error: `Node "${node.title}" has no children, cannot find "${currentSearch}"`
        };
    }
    const matchingChild = node.children.find(child => child.title.toLowerCase() === currentSearch);
    if (!matchingChild) {
        return {
            found: false,
            error: `Could not find child "${currentSearch}" in node "${node.title}"`
        };
    }
    return findNodeByPath(matchingChild, searchPath.slice(1));
}
function searchNodes(node, query, options = {}, parents = []) {
    const matches = [];
    const searchQuery = options.caseSensitive ? query : query.toLowerCase();
    const searchFields = options.searchIn || ['title', 'notes', 'labels', 'callouts', 'tasks'];
    const matchedIn = [];
    const matchesText = (text) => {
        if (!text)
            return false;
        const searchIn = options.caseSensitive ? text : text.toLowerCase();
        return searchIn.includes(searchQuery);
    };
    // Check task status filter
    if (options.taskStatus && node.taskStatus) {
        if (node.taskStatus !== options.taskStatus) {
            return [];
        }
    }
    // Check each configured field
    if (searchFields.includes('title') && matchesText(node.title)) {
        matchedIn.push('title');
    }
    if (searchFields.includes('notes') && node.notes?.content && matchesText(node.notes.content)) {
        matchedIn.push('notes');
    }
    if (searchFields.includes('labels') && node.labels?.some(label => matchesText(label))) {
        matchedIn.push('labels');
    }
    if (searchFields.includes('callouts') && node.callouts?.some(callout => matchesText(callout.title))) {
        matchedIn.push('callouts');
    }
    if (searchFields.includes('tasks') && node.taskStatus) {
        matchedIn.push('tasks');
    }
    const shouldIncludeNode = matchedIn.length > 0 ||
        (options.taskStatus && node.taskStatus === options.taskStatus);
    if (shouldIncludeNode && node.id) {
        matches.push({
            id: node.id,
            title: node.title,
            path: getNodePath(node, parents),
            sheet: node.sheetTitle || 'Untitled Map',
            matchedIn,
            notes: node.notes?.content,
            labels: node.labels,
            callouts: node.callouts,
            taskStatus: node.taskStatus
        });
    }
    // Search recursively in children
    if (node.children) {
        const currentPath = [...parents, node.title];
        node.children.forEach(child => {
            matches.push(...searchNodes(child, query, options, currentPath));
        });
    }
    return matches;
}
function findNodeById(node, searchId) {
    if (node.id === searchId) {
        return { found: true, node };
    }
    if (!node.children) {
        return { found: false };
    }
    for (const child of node.children) {
        const result = findNodeById(child, searchId);
        if (result.found) {
            return result;
        }
    }
    return { found: false };
}
function findNodesbyFuzzyPath(node, searchQuery, parents = [], threshold = 0.5) {
    const results = [];
    const currentPath = getNodePath(node, parents);
    function calculateRelevance(nodePath, query) {
        const pathLower = nodePath.toLowerCase();
        const queryLower = query.toLowerCase();
        if (pathLower.includes(queryLower)) {
            return 1.0;
        }
        const pathWords = pathLower.split(/[\s>]+/);
        const queryWords = queryLower.split(/[\s>]+/);
        const matchingWords = queryWords.filter(word => pathWords.some(pathWord => pathWord.includes(word)));
        return matchingWords.length / queryWords.length;
    }
    const confidence = calculateRelevance(currentPath, searchQuery);
    if (confidence > threshold) {
        results.push({
            node,
            matchConfidence: confidence,
            path: currentPath
        });
    }
    if (node.children) {
        const newParents = [...parents, node.title];
        node.children.forEach(child => {
            results.push(...findNodesbyFuzzyPath(child, searchQuery, newParents, threshold));
        });
    }
    return results;
}
// Server setup using new McpServer API
const server = new McpServer({
    name: "xmind-analysis-server",
    version: "2.0.0",
});
// Tool: read_xmind
server.tool("read_xmind", `Parse and analyze XMind files with multiple capabilities:
- Extract complete mind map structure in JSON format
- Include all relationships between nodes with their IDs and titles
- Extract callouts attached to topics
- Generate text or markdown summaries
- Search for specific content
- Get hierarchical path to any node
- Filter content by labels, task status, or node depth
- Extract all URLs and external references
- Analyze relationships and connections between topics`, {
    path: z.string().describe("Path to the .xmind file"),
}, async ({ path: filePath }) => {
    if (!isPathAllowed(filePath)) {
        return {
            content: [{ type: "text", text: `Error: Access denied - ${filePath} is not in an allowed directory` }],
            isError: true,
        };
    }
    try {
        const parser = new XMindParser(filePath);
        const mindmap = await parser.parse();
        return {
            content: [{ type: "text", text: JSON.stringify(mindmap, null, 2) }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Tool: list_xmind_directory
server.tool("list_xmind_directory", `Comprehensive XMind file discovery and analysis tool:
- Recursively scan directories for .xmind files
- Filter files by creation/modification date
- Search for files containing specific content
- Group files by project or category
- Detect duplicate mind maps
- Generate directory statistics and summaries
- Verify file integrity and structure
- Monitor changes in mind map files`, {
    directory: z.string().optional().describe("Directory to scan (defaults to all allowed directories)"),
}, async ({ directory }) => {
    try {
        const files = await listXMindFiles(directory);
        return {
            content: [{ type: "text", text: files.length > 0 ? files.join('\n') : "No XMind files found" }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Tool: read_multiple_xmind_files
server.tool("read_multiple_xmind_files", `Advanced multi-file analysis and correlation tool:
- Process multiple XMind files simultaneously
- Compare content across different mind maps
- Identify common themes and patterns
- Merge related content from different files
- Generate cross-reference reports
- Find content duplications across files
- Create consolidated summaries
- Track changes across multiple versions
- Generate comparative analysis`, {
    paths: z.array(z.string()).describe("Array of paths to .xmind files"),
}, async ({ paths }) => {
    try {
        const results = await readMultipleXMindFiles(paths);
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Tool: search_xmind_files
server.tool("search_xmind_files", `Advanced file search tool with recursive capabilities:
- Search for files and directories by partial name matching
- Case-insensitive pattern matching
- Searches through all subdirectories recursively
- Returns full paths to all matching items
- Includes both files and directories in results
- Safe searching within allowed directories only
- Handles special characters in names
- Continues searching even if some directories are inaccessible`, {
    pattern: z.string().describe("Search pattern to match in file names or content"),
    directory: z.string().optional().describe("Starting directory for search"),
}, async ({ pattern }) => {
    try {
        const matches = await searchXMindFiles(pattern);
        return {
            content: [{ type: "text", text: matches.length > 0 ? matches.join('\n') : "No matching files found" }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Tool: extract_node
server.tool("extract_node", `Smart node extraction with fuzzy path matching:
- Flexible search using partial or complete node paths
- Returns multiple matching nodes ranked by relevance
- Supports approximate matching for better results
- Includes full context and hierarchy information
- Returns complete subtree for each match
- Best tool for exploring and navigating complex mind maps
- Perfect for finding nodes when exact path is unknown
Usage examples:
- "Project > Backend" : finds nodes in any path containing these terms
- "Feature API" : finds nodes containing these words in any order`, {
    path: z.string().describe("Path to the .xmind file"),
    searchQuery: z.string().describe("Text to search in node paths (flexible matching)"),
}, async ({ path: filePath, searchQuery }) => {
    if (!isPathAllowed(filePath)) {
        return {
            content: [{ type: "text", text: `Error: Access denied - ${filePath} is not in an allowed directory` }],
            isError: true,
        };
    }
    try {
        const parser = new XMindParser(filePath);
        const mindmap = await parser.parse();
        const allMatches = mindmap.flatMap(sheet => findNodesbyFuzzyPath(sheet, searchQuery));
        allMatches.sort((a, b) => b.matchConfidence - a.matchConfidence);
        if (allMatches.length === 0) {
            return {
                content: [{ type: "text", text: `No nodes found matching: ${searchQuery}` }],
            };
        }
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        matches: allMatches.slice(0, 5),
                        totalMatches: allMatches.length,
                        query: searchQuery
                    }, null, 2)
                }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Tool: extract_node_by_id
server.tool("extract_node_by_id", `Extract a specific node and its subtree using its unique ID:
- Find and extract node using its XMind ID
- Return complete subtree structure
- Preserve all node properties and relationships
- Fast direct access without path traversal
Note: For a more detailed view with fuzzy matching, use "extract_node" with the node's path`, {
    path: z.string().describe("Path to the .xmind file"),
    nodeId: z.string().describe("Unique identifier of the node"),
}, async ({ path: filePath, nodeId }) => {
    if (!isPathAllowed(filePath)) {
        return {
            content: [{ type: "text", text: `Error: Access denied - ${filePath} is not in an allowed directory` }],
            isError: true,
        };
    }
    try {
        const parser = new XMindParser(filePath);
        const mindmap = await parser.parse();
        for (const sheet of mindmap) {
            const result = findNodeById(sheet, nodeId);
            if (result.found && result.node) {
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify(result.node, null, 2)
                        }],
                };
            }
        }
        return {
            content: [{ type: "text", text: `Node not found with ID: ${nodeId}` }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Tool: search_nodes
server.tool("search_nodes", `Advanced node search with multiple criteria:
- Search through titles, notes, labels, callouts and tasks
- Filter by task status (todo/done)
- Find nodes by their relationships
- Configure which fields to search in
- Case-sensitive or insensitive search
- Get full context including task status
- Returns all matching nodes with their IDs
- Includes relationship information and task status`, {
    path: z.string().describe("Path to the .xmind file"),
    query: z.string().describe("Search text"),
    searchIn: z.array(z.enum(['title', 'notes', 'labels', 'callouts', 'tasks'])).optional()
        .describe("Fields to search in"),
    caseSensitive: z.boolean().optional().describe("Whether search is case-sensitive"),
    taskStatus: z.enum(['todo', 'done']).optional().describe("Filter by task status"),
}, async ({ path: filePath, query, searchIn, caseSensitive, taskStatus }) => {
    if (!isPathAllowed(filePath)) {
        return {
            content: [{ type: "text", text: `Error: Access denied - ${filePath} is not in an allowed directory` }],
            isError: true,
        };
    }
    try {
        const parser = new XMindParser(filePath);
        const mindmap = await parser.parse();
        const matches = mindmap.flatMap(sheet => searchNodes(sheet, query, {
            searchIn,
            caseSensitive,
            taskStatus
        }));
        const result = {
            query,
            matches,
            totalMatches: matches.length,
            searchedIn: searchIn || ['title', 'notes', 'labels', 'callouts', 'tasks']
        };
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Helper: generate unique ID
function generateId() {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 26);
}
// Schemas for create_xmind input
const CreateTopicSchema = z.lazy(() => z.object({
    title: z.string().describe("Topic title"),
    children: z.array(CreateTopicSchema).optional().describe("Child topics"),
    notes: z.union([
        z.string(),
        z.object({
            plain: z.string().optional().describe("Plain text content"),
            html: z.string().optional().describe("HTML formatted content (supports <strong>, <u>, <ul>, <ol>, <li>, <br>)"),
        }),
    ]).optional().describe("Notes: string for plain text, or {plain?, html?} for formatted notes"),
    href: z.string().optional().describe("URL link (external)"),
    linkToTopic: z.string().optional().describe("Title of a topic to link to (creates internal xmind:# link, works across sheets)"),
    labels: z.array(z.string()).optional().describe("Labels/tags"),
    markers: z.array(z.string()).optional().describe("Marker IDs (e.g. 'task-done', 'task-start', 'priority-1')"),
    callouts: z.array(z.string()).optional().describe("Callout text bubbles attached to this topic"),
    boundaries: z.array(z.object({
        range: z.string().describe("Range of children to group, e.g. '(1,3)'"),
        title: z.string().optional().describe("Boundary label"),
    })).optional().describe("Visual boundaries grouping children"),
    summaryTopics: z.array(z.object({
        range: z.string().describe("Range of children to summarize, e.g. '(0,2)'"),
        title: z.string().describe("Summary topic title"),
    })).optional().describe("Summary topics spanning children ranges"),
    structureClass: z.string().optional().describe("Layout structure: 'org.xmind.ui.map.clockwise', 'org.xmind.ui.map.unbalanced', 'org.xmind.ui.logic.right', 'org.xmind.ui.org-chart.down', 'org.xmind.ui.tree.right', 'org.xmind.ui.fishbone.leftHeaded', 'org.xmind.ui.timeline.horizontal'"),
    topicClass: z.enum(['topic', 'importantTopic', 'minorTopic']).optional().describe("Node class type: 'topic' (default), 'importantTopic' (bold, dark red), 'minorTopic' (bold, brown)"),
    taskStatus: z.enum(['todo', 'done']).optional().describe("Simple to-do checkbox: 'todo' (unchecked) or 'done' (checked). Use ONLY for simple checklists without dates."),
    progress: z.number().min(0).max(1).optional().describe("Planned Task: completion progress 0.0 to 1.0. Use with startDate/dueDate for project planning."),
    priority: z.number().min(1).max(9).optional().describe("Planned Task: priority level 1-9 (1=highest)"),
    startDate: z.string().optional().describe("Planned Task: start date in ISO 8601 (e.g. '2026-02-01T00:00:00Z'). Enables timeline/Gantt view in XMind."),
    dueDate: z.string().optional().describe("Planned Task: due date in ISO 8601 (e.g. '2026-02-15T00:00:00Z'). Enables timeline/Gantt view in XMind."),
    durationDays: z.number().min(1).optional().describe("Planned Task: duration in days (without dates). XMind auto-calculates dates from dependencies. Preferred for relative planning."),
    dependencies: z.array(z.object({
        targetTitle: z.string().describe("Title of the dependency target topic"),
        type: z.enum(['FS', 'FF', 'SS', 'SF']).describe("FS=Finish-Start, FF=Finish-Finish, SS=Start-Start, SF=Start-Finish"),
        lag: z.number().optional().describe("Lag in days (default 0)"),
    })).optional().describe("Task dependencies for automatic scheduling (use with durationDays instead of explicit dates)"),
}));
const CreateRelationshipSchema = z.object({
    sourceTitle: z.string().describe("Title of source topic"),
    targetTitle: z.string().describe("Title of target topic"),
    title: z.string().optional().describe("Relationship label"),
});
const CreateSheetSchema = z.object({
    title: z.string().describe("Sheet title"),
    rootTopic: CreateTopicSchema.describe("Root topic of the sheet"),
    relationships: z.array(CreateRelationshipSchema).optional().describe("Relationships between topics (by title)"),
    theme: z.enum(['default', 'business', 'dark', 'simple', 'rainbow']).optional().describe("Visual theme for the sheet. Use 'rainbow' for the original XMind Rainbow theme with dark navy style."),
});
// Predefined themes
const THEMES = {
    default: {},
    business: {
        centralTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "30pt", "fo:font-weight": "800", "svg:fill": "#0D0D0D", "fill-pattern": "none", "line-width": "2pt", "line-color": "#0D0D0D", "line-pattern": "solid", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.curve" } },
        mainTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "18pt", "fo:font-weight": "500", "fill-pattern": "solid", "line-width": "2pt", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow" } },
        subTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "14pt", "fo:font-weight": "400", "fill-pattern": "none", "line-width": "2pt", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow" } },
        importantTopic: { id: generateId(), properties: { "fo:font-weight": "bold", "svg:fill": "#dff116ff", "fill-pattern": "solid", "border-line-color": "#dff116ff", "border-line-width": "0" } },
        minorTopic: { id: generateId(), properties: { "fo:font-weight": "bold", "svg:fill": "#3bf115ff", "fill-pattern": "solid", "border-line-color": "#3bf115ff", "border-line-width": "0" } },
        expiredTopic: { id: generateId(), properties: { "fo:text-decoration": "line-through", "fill-pattern": "none" } },
        map: { id: generateId(), properties: { "svg:fill": "#FFFFFF", "multi-line-colors": "#F22816 #F2B807 #233ED9", "color-list": "#FFFFFF #F2F2F2 #F22816 #F2B807 #233ED9 #0D0D0D", "line-tapered": "none" } },
    },
    dark: {
        centralTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "30pt", "fo:font-weight": "800", "fo:color": "#FFFFFF", "svg:fill": "#2D2D2D", "fill-pattern": "solid", "line-width": "2pt", "line-color": "#FFFFFF", "line-pattern": "solid", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.curve" } },
        mainTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "18pt", "fo:font-weight": "500", "fo:color": "#FFFFFF", "fill-pattern": "solid", "line-width": "2pt", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow" } },
        subTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "14pt", "fo:font-weight": "400", "fo:color": "#CCCCCC", "fill-pattern": "none", "line-width": "2pt", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow" } },
        map: { id: generateId(), properties: { "svg:fill": "#1A1A1A", "multi-line-colors": "#FF6B6B #FFD93D #6BCB77", "color-list": "#1A1A1A #2D2D2D #FF6B6B #FFD93D #6BCB77 #FFFFFF", "line-tapered": "none" } },
    },
    simple: {
        centralTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "24pt", "fo:font-weight": "600", "svg:fill": "#FFFFFF", "fill-pattern": "solid", "line-width": "1pt", "line-color": "#333333", "line-pattern": "solid", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.curve" } },
        mainTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "16pt", "fo:font-weight": "400", "fill-pattern": "solid", "line-width": "1pt", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow" } },
        subTopic: { id: generateId(), properties: { "fo:font-family": "NeverMind", "fo:font-size": "13pt", "fo:font-weight": "400", "fill-pattern": "none", "line-width": "1pt", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow" } },
        map: { id: generateId(), properties: { "svg:fill": "#FFFFFF", "multi-line-colors": "#4A90D9 #50C878 #FF8C42", "color-list": "#FFFFFF #F5F5F5 #4A90D9 #50C878 #FF8C42 #333333", "line-tapered": "none" } },
    },
    rainbow: {
        map: { id: "a5318104-4d06-4aa1-8e50-865fe979fa46", properties: { "svg:fill": "#ffffff", "multi-line-colors": "#F9423A #F6A04D #F3D321 #00BC7B #486AFF #4D49BE", "color-list": "#000229 #1F2766 #52CC83 #4D86DB #99142F #245570", "line-tapered": "none" } },
        centralTopic: { id: "1c567dac-908e-46c7-bbed-8a13fbd83884", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "30pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "center", "svg:fill": "#000229", "fill-pattern": "solid", "line-width": "3pt", "line-color": "#000229", "line-pattern": "solid", "border-line-color": "inherited", "border-line-width": "inherited", "border-line-pattern": "inherited", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow", "arrow-end-class": "org.xmind.arrowShape.none", "alignment-by-level": "inactived" } },
        mainTopic: { id: "9c34cfb3-a76c-4496-b2a4-22c49336de57", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "18pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "left", "svg:fill": "inherited", "fill-pattern": "none", "line-width": "inherited", "line-color": "inherited", "line-pattern": "inherited", "border-line-color": "inherited", "border-line-width": "0pt", "border-line-pattern": "inherited", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow", "arrow-end-class": "inherited", "alignment-by-level": "inherited" } },
        subTopic: { id: "05cc50af-4122-49c1-956f-1b9b92bd5d31", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "14pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "left", "svg:fill": "inherited", "fill-pattern": "none", "line-width": "2pt", "line-color": "inherited", "line-pattern": "inherited", "border-line-color": "inherited", "border-line-width": "0pt", "border-line-pattern": "inherited", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow", "arrow-end-class": "inherited", "alignment-by-level": "inherited" } },
        floatingTopic: { id: "f2bb6e42-a111-4eee-9e5e-c93b8c476dac", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "14pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "center", "svg:fill": "#EEEBEE", "fill-pattern": "solid", "line-width": "inherited", "line-color": "inherited", "line-pattern": "solid", "border-line-color": "#EEEBEE", "border-line-width": "0pt", "border-line-pattern": "inherited", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow", "arrow-end-class": "org.xmind.arrowShape.none", "alignment-by-level": "inherited" } },
        summaryTopic: { id: "6bfa89ca-e996-43a4-84f3-49960370bfeb", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "14pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "center", "svg:fill": "#000229", "fill-pattern": "solid", "line-width": "inherited", "line-color": "inherited", "line-pattern": "inherited", "border-line-color": "#000229", "border-line-width": "0pt", "border-line-pattern": "inherited", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow", "arrow-end-class": "inherited", "alignment-by-level": "inherited" } },
        calloutTopic: { id: "faef1105-1db2-4fc9-b9ce-f3379673733a", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "14pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "left", "svg:fill": "#000229", "fill-pattern": "solid", "line-width": "inherited", "line-color": "inherited", "line-pattern": "inherited", "border-line-color": "#000229", "border-line-width": "inherited", "border-line-pattern": "inherited", "shape-class": "org.xmind.topicShape.roundedRect", "line-class": "org.xmind.branchConnection.roundedElbow", "arrow-end-class": "inherited", "alignment-by-level": "inherited" } },
        importantTopic: { id: "2da78364-9afa-4ae2-b8f4-32dd8d40050e", properties: { "fo:font-weight": "bold", "svg:fill": "#460400", "fill-pattern": "solid", "border-line-color": "#460400", "border-line-width": "0" } },
        minorTopic: { id: "7e6120b2-413d-4b1b-8950-a4d2ac17a4c6", properties: { "fo:font-weight": "bold", "svg:fill": "#703D00", "fill-pattern": "solid", "border-line-color": "#703D00", "border-line-width": "0" } },
        expiredTopic: { id: "066c1e82-8b2e-4b97-8d53-883905fd771a", properties: { "fo:text-decoration": "line-through", "fill-pattern": "none" } },
        boundary: { id: "a8992038-8df0-4127-9306-81d707e74479", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "14pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "center", "svg:fill": "#000229", "fill-pattern": "solid", "line-width": "2", "line-color": "#000229", "line-pattern": "dash", "shape-class": "org.xmind.boundaryShape.roundedRect" } },
        summary: { id: "a1c68178-82a0-443f-95e3-d07a5c53db3b", properties: { "line-width": "2pt", "line-color": "#000229", "line-pattern": "solid", "shape-class": "org.xmind.summaryShape.square" } },
        relationship: { id: "33fef83d-42e8-440f-b0f5-73e18dd33332", properties: { "fo:font-family": "Droid Serif", "fo:font-size": "13pt", "fo:font-weight": "400", "fo:font-style": "normal", "fo:color": "inherited", "fo:text-transform": "manual", "fo:text-decoration": "none", "fo:text-align": "center", "line-width": "2", "line-color": "#000229", "line-pattern": "dash", "shape-class": "org.xmind.relationshipShape.curved", "arrow-begin-class": "org.xmind.arrowShape.none", "arrow-end-class": "org.xmind.arrowShape.triangle" } },
        skeletonThemeId: "c1fbada1b45ba2e3bfc3b8b57b",
        colorThemeId: "Rainbow-#000229-MULTI_LINE_COLORS",
    },
};
const CreateXMindArgsSchema = z.object({
    path: z.string().describe("Output path for the .xmind file (must end with .xmind)"),
    sheets: z.array(CreateSheetSchema).min(1).describe("Sheets to create"),
    overwrite: z.boolean().optional().default(false).describe("Overwrite existing file"),
});
// XMind Builder class
class XMindBuilder {
    titleToId = new Map();
    pendingDependencies = new Map();
    pendingLinks = new Map(); // topicId -> targetTitle
    build(sheets) {
        this.titleToId.clear();
        this.pendingDependencies.clear();
        this.pendingLinks.clear();
        // First pass: build all sheets (populates titleToId across all sheets)
        const builtSheets = [];
        for (const sheet of sheets) {
            const rootTopic = this.buildTopic(sheet.rootTopic);
            this.resolveDependencies(rootTopic);
            builtSheets.push({ rootTopic, sheet });
        }
        // Second pass: resolve linkToTopic -> xmind:#id
        for (const { rootTopic } of builtSheets) {
            this.resolveLinks(rootTopic);
        }
        const contentJson = builtSheets.map(({ rootTopic, sheet }) => {
            const sheetTheme = sheet.theme ? THEMES[sheet.theme] || {} : {};
            const hasPlannedTasks = this.hasPlannedTasks(sheet.rootTopic);
            const sheetObj = {
                id: generateId(),
                class: "sheet",
                title: sheet.title,
                rootTopic,
                topicOverlapping: "overlap",
                compactLayoutModeLevel: "Second",
                theme: sheetTheme,
            };
            // 添加骨架结构扩展
            sheetObj.extensions = [{
                    provider: "org.xmind.ui.skeleton.structure.style",
                    content: {
                        centralTopic: "org.xmind.ui.logic.right"
                    }
                }];
            if (hasPlannedTasks) {
                // 合并工作日设置扩展（不覆盖已有的 extensions）
                const existingExtensions = sheetObj.extensions;
                existingExtensions.push({
                    provider: "org.xmind.ui.working-day-settings",
                    content: {
                        id: "YmFzaWMtY2FsZW5kYXI=",
                        name: "Calendrier de base",
                        defaultWorkingDays: [1, 2, 3, 4, 5],
                        rules: [],
                    },
                });
            }
            if (sheet.relationships && sheet.relationships.length > 0) {
                sheetObj.relationships = sheet.relationships.map(rel => {
                    const end1Id = this.titleToId.get(rel.sourceTitle);
                    const end2Id = this.titleToId.get(rel.targetTitle);
                    if (!end1Id)
                        throw new Error(`Relationship source topic not found: "${rel.sourceTitle}"`);
                    if (!end2Id)
                        throw new Error(`Relationship target topic not found: "${rel.targetTitle}"`);
                    const relObj = {
                        id: generateId(),
                        end1Id,
                        end2Id,
                    };
                    if (rel.title) {
                        relObj.title = rel.title;
                        relObj.attributedTitle = [{ text: rel.title }];
                    }
                    return relObj;
                });
            }
            return sheetObj;
        });
        const metadata = JSON.stringify({
            dataStructureVersion: "2",
            creator: { name: "Vana", version: "24.01.13311" },
            layoutEngineVersion: "3",
        });
        const manifest = JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {}, "Thumbnails/thumbnail.png": {} } });
        return {
            content: JSON.stringify(contentJson),
            metadata,
            manifest,
        };
    }
    resolveLinks(topic) {
        const targetTitle = this.pendingLinks.get(topic.id);
        if (targetTitle) {
            const targetId = this.titleToId.get(targetTitle);
            if (!targetId)
                throw new Error(`Link target topic not found: "${targetTitle}"`);
            topic.href = `xmind:#${targetId}`;
        }
        if (topic.children?.attached) {
            for (const child of topic.children.attached)
                this.resolveLinks(child);
        }
        if (topic.children?.callout) {
            for (const child of topic.children.callout)
                this.resolveLinks(child);
        }
    }
    resolveDependencies(topic) {
        const deps = this.pendingDependencies.get(topic.id);
        if (deps && topic.extensions) {
            const taskExt = topic.extensions.find(e => e.provider === 'org.xmind.ui.task');
            if (taskExt) {
                const resolved = deps.map(d => {
                    const targetId = this.titleToId.get(d.targetTitle);
                    if (!targetId)
                        throw new Error(`Dependency target not found: "${d.targetTitle}"`);
                    return { id: targetId, type: d.type, lag: d.lag ?? 0 };
                });
                taskExt.content.dependencies = resolved;
            }
        }
        if (topic.children?.attached) {
            for (const child of topic.children.attached) {
                this.resolveDependencies(child);
            }
        }
    }
    hasPlannedTasks(input) {
        if (input.startDate || input.dueDate || input.progress !== undefined || input.durationDays !== undefined)
            return true;
        if (input.children) {
            return input.children.some(c => this.hasPlannedTasks(c));
        }
        return false;
    }
    buildTopic(input) {
        const id = generateId();
        this.titleToId.set(input.title, id);
        const nodeClass = input.topicClass || 'topic';
        const topic = { id, class: nodeClass, title: input.title };
        topic.attributedTitle = [{ text: input.title }];
        if (input.structureClass) {
            topic.structureClass = input.structureClass;
        }
        if (input.notes) {
            if (typeof input.notes === 'string') {
                topic.notes = { plain: { content: input.notes } };
            }
            else {
                topic.notes = {};
                if (input.notes.plain)
                    topic.notes.plain = { content: input.notes.plain };
                if (input.notes.html)
                    topic.notes.realHTML = { content: input.notes.html };
            }
        }
        if (input.href) {
            topic.href = input.href;
        }
        if (input.linkToTopic) {
            this.pendingLinks.set(id, input.linkToTopic);
        }
        if (input.labels) {
            topic.labels = input.labels;
        }
        if (input.markers && input.markers.length > 0) {
            topic.markers = input.markers.map(m => ({ markerId: m }));
        }
        // Build task extension (simple status and/or Gantt properties)
        const hasTaskProps = input.taskStatus || input.progress !== undefined ||
            input.priority !== undefined || input.startDate || input.dueDate ||
            input.durationDays !== undefined || input.dependencies;
        if (hasTaskProps) {
            const taskContent = {};
            if (input.taskStatus)
                taskContent.status = input.taskStatus;
            if (input.progress !== undefined)
                taskContent.progress = input.progress;
            if (input.priority !== undefined)
                taskContent.priority = input.priority;
            if (input.startDate)
                taskContent.start = new Date(input.startDate).getTime();
            if (input.dueDate) {
                taskContent.due = new Date(input.dueDate).getTime();
                if (input.startDate) {
                    taskContent.duration = new Date(input.dueDate).getTime() - new Date(input.startDate).getTime();
                }
            }
            if (input.durationDays !== undefined && !input.startDate) {
                taskContent.duration = input.durationDays * 86400000;
            }
            if (input.dependencies && input.dependencies.length > 0) {
                // Store for deferred resolution (titles -> IDs)
                this.pendingDependencies.set(id, input.dependencies);
            }
            topic.extensions = [{
                    provider: 'org.xmind.ui.task',
                    content: taskContent,
                }];
        }
        // Boundaries
        if (input.boundaries && input.boundaries.length > 0) {
            topic.boundaries = input.boundaries.map(b => ({
                id: generateId(),
                range: b.range,
                ...(b.title ? { title: b.title } : {}),
            }));
        }
        // Summaries
        if (input.summaryTopics && input.summaryTopics.length > 0) {
            topic.summaries = input.summaryTopics.map(s => {
                const topicId = generateId();
                return { id: generateId(), range: s.range, topicId };
            });
            topic.summary = input.summaryTopics.map((s, i) => ({
                id: topic.summaries[i].topicId,
                title: s.title,
            }));
        }
        const attached = input.children && input.children.length > 0
            ? input.children.map(c => this.buildTopic(c))
            : undefined;
        const callout = input.callouts && input.callouts.length > 0
            ? input.callouts.map(text => ({ id: generateId(), title: text }))
            : undefined;
        if (attached || callout) {
            topic.children = {};
            if (attached)
                topic.children.attached = attached;
            if (callout)
                topic.children.callout = callout;
        }
        return topic;
    }
}
// Tool: create_xmind
server.tool("create_xmind", `Create a new XMind mind map file from structured data.

FEATURES:
- Nested topics with notes, labels, links (href or linkToTopic for internal links across sheets), callouts
- Boundaries (visual grouping of children) and summaries
- Relationships between topics (by title)
- Overwrite protection (set overwrite=true to replace)

SIMPLE TO-DO (checkbox): Use taskStatus='todo' or 'done'. No dates needed.
  Example: { "title": "Buy milk", "taskStatus": "todo" }

PLANNED TASK - Two approaches:
1. RELATIVE (preferred for planning): Use durationDays + dependencies. XMind auto-calculates dates.
   Example: { "title": "Dev", "durationDays": 5, "progress": 0, "dependencies": [{"targetTitle": "Analysis", "type": "FS"}] }
   Dependency types: FS=Finish-Start, FF=Finish-Finish, SS=Start-Start, SF=Start-Finish
2. ABSOLUTE: Use startDate + dueDate (ISO 8601) + progress + priority for fixed dates.
   Example: { "title": "Phase 1", "startDate": "2026-02-01T00:00:00Z", "dueDate": "2026-02-15T00:00:00Z", "progress": 0.0, "priority": 1 }

MARKERS: Visual icons - 'task-done' (checked), 'task-start' (clock), 'priority-1' to 'priority-9'

IMPORTANT: When user mentions "planning", "schedule", "timeline", "Gantt", "project", "deployment", "phases", use RELATIVE planned tasks (durationDays + dependencies) unless specific dates are given.`, {
    path: z.string().describe("Output path for the .xmind file (must end with .xmind)"),
    sheets: z.array(CreateSheetSchema).min(1).describe("Sheets to create"),
    overwrite: z.boolean().optional().default(false).describe("Overwrite existing file"),
}, async ({ path: filePath, sheets, overwrite }) => {
    // Validate extension
    if (!filePath.toLowerCase().endsWith('.xmind')) {
        return {
            content: [{ type: "text", text: "Error: File path must end with .xmind" }],
            isError: true,
        };
    }
    const resolvedPath = path.resolve(filePath);
    // Validate allowed directory
    if (!isPathAllowed(resolvedPath)) {
        return {
            content: [{ type: "text", text: `Error: Access denied - ${filePath} is not in an allowed directory` }],
            isError: true,
        };
    }
    // Check overwrite
    try {
        await fs.access(resolvedPath);
        if (!overwrite) {
            return {
                content: [{ type: "text", text: `Error: File already exists: ${filePath}. Set overwrite=true to replace.` }],
                isError: true,
            };
        }
    }
    catch {
        // File doesn't exist, OK
    }
    try {
        const builder = new XMindBuilder();
        const { content, metadata, manifest } = builder.build(sheets);
        const zip = new AdmZip();
        zip.addFile('content.json', Buffer.from(content, 'utf-8'));
        zip.addFile('metadata.json', Buffer.from(metadata, 'utf-8'));
        zip.addFile('manifest.json', Buffer.from(manifest, 'utf-8'));
        // 添加 content.xml（兼容旧版 XMind 格式）
        const contentXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:fo="http://www.w3.org/1999/XSL/Format" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" modified-by="bruce" timestamp="1503058545540" version="2.0"><sheet id="7abtd0ssc7n4pi1nu6i7b6lsdh" modified-by="bruce" theme="0kdeemiijde6nuk97e4t0vpp54" timestamp="1503058545540"><topic id="1vr0lcte2og4t2sopiogvdmifc" modified-by="bruce" structure-class="org.xmind.ui.logic.right" timestamp="1503058545417"><title>Warning\n警告\nAttention\nWarnung\n경고</title><children><topics type="attached"><topic id="71h1aip2t1o8vvm0a41nausaar" modified-by="bruce" timestamp="1503058545423"><title svg:width="500">This file can not be opened normally, please do not modify and save, otherwise the contents will be permanently lost！</title><children><topics type="attached"><topic id="428akmkh9a0tog6c91qj995qdl" modified-by="bruce" timestamp="1503058545427"><title>You can try using XMind 8 Update 3 or later version to open</title></topic></topics></children></topic><topic id="2kb87f8m38b3hnfhp450c7q35e" modified-by="bruce" timestamp="1503058545434"><title svg:width="500">该文件无法正常打开，请勿修改并保存，否则文件内容将会永久性丢失！</title><children><topics type="attached"><topic id="3m9hoo4a09n53ofl6fohdun99f" modified-by="bruce" timestamp="1503058545438"><title>你可以尝试使用 XMind 8 Update 3 或更新版本打开</title></topic></topics></children></topic><topic id="7r3r4617hvh931ot9obi595r8f" modified-by="bruce" timestamp="1503058545444"><title svg:width="500">該文件無法正常打開，請勿修改並保存，否則文件內容將會永久性丟失！</title><children><topics type="attached"><topic id="691pgka6gmgpgkacaa0h3f1hjb" modified-by="bruce" timestamp="1503058545448"><title>你可以嘗試使用 XMind 8 Update 3 或更新版本打開</title></topic></topics></children></topic><topic id="0f2e3rpkfahg4spg4nda946r0b" modified-by="bruce" timestamp="1503058545453"><title svg:width="500">この文書は正常に開かないので、修正して保存しないようにしてください。そうでないと、書類の内容が永久に失われます。！</title><children><topics type="attached"><topic id="4vuubta53ksc1falk46mevge0t" modified-by="bruce" timestamp="1503058545457"><title>XMind 8 Update 3 や更新版を使って開くこともできます</title></topic></topics></children></topic><topic id="70n9i4u3lb89sq9l1m1bs255j5" modified-by="bruce" timestamp="1503058545463"><title svg:width="500">Datei kann nicht richtig geöffnet werden. Bitte ändern Sie diese Datei nicht und speichern Sie sie, sonst wird die Datei endgültig gelöscht werden.</title><children><topics type="attached"><topic id="1qpc5ee298p2sqeqbinpca46b7" modified-by="bruce" timestamp="1503058545466"><title svg:width="500">Bitte versuchen Sie, XMind 8 Update 3 oder neuere Version zu verwenden.</title></topic></topics></children></topic><topic id="5q6bq8c6q6a1a6a6a6a6a6a6a6a" modified-by="bruce" timestamp="1503058545470"><title svg:width="500">이 파일은 정상적으로 열리지 않으니, 수정 및 저장하지 마십시오. 그렇지 않으면 파일 내용이 영구적으로 손실됩니다!</title><children><topics type="attached"><topic id="6a6a6a6a6a6a6a6a6a6a6a6a6a" modified-by="bruce" timestamp="1503058545473"><title>XMind 8 Update 3 이상 버전에서 열어보시기 바랍니다.</title></topic></topics></children></topic></topics></children></topic></sheet></xmap-content>`;
        zip.addFile('content.xml', Buffer.from(contentXml, 'utf-8'));
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        zip.writeZip(resolvedPath);
        return {
            content: [{ type: "text", text: `XMind file created: ${resolvedPath}` }],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});
// Start server
async function runServer() {
    await validateDirectories();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("XMind Analysis Server running on stdio");
    console.error("Allowed directories:", allowedDirectories);
}
runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
