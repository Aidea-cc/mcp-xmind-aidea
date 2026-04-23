#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';

console.log('=== 直接创建并测试 ===\n');

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xmind-test-'));
const outputPath = path.join(tempDir, 'direct-test.xmind');

console.log('从 dist/index.js 导入...');
const mod = await import('./dist/index.js');
console.log('可用的导出:', Object.keys(mod));

console.log('\n创建一个简单的测试 XMind...');
await mod.createXMind(outputPath, {
    sheets: [{
        title: 'Test',
        theme: 'rainbow',
        rootTopic: {
            title: 'Central',
            topicClass: 'importantTopic',
            children: [
                { title: 'Branch 1' }
            ]
        }
    }]
});

console.log('✓ 创建完成');

const zip = new AdmZip(outputPath);
console.log('\n文件列表:');
zip.getEntries().forEach(e => console.log('  -', e.entryName));

console.log('\n检查 content.xml:');
const content = zip.readAsText('content.xml');
console.log('✓ attributedTitle:', content.includes('attributedTitle'));
console.log('✓ importantTopic:', content.includes('importantTopic'));
console.log('✓ rainbow:', content.includes('rainbow'));

console.log('\n✅ 文件保存在:', outputPath);
