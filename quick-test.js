#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';

console.log('=== 快速验证 XMind 格式 ===\n');

// 创建测试文件路径
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xmind-quick-'));
const outputPath = path.join(tempDir, 'quick-test.xmind');

// 导入编译后的模块
console.log('导入编译后的模块...');
import('./dist/index.js').then(async (mod) => {
    console.log('可用函数:', Object.keys(mod));
    
    // 创建 XMind 文件
    console.log('\n正在创建 XMind 文件...');
    await mod.createXMind(outputPath, {
        sheets: [{
            title: 'Quick Test',
            theme: 'rainbow',
            rootTopic: {
                title: 'Hello World',
                topicClass: 'importantTopic',
                children: [
                    { title: 'Branch 1', topicClass: 'minorTopic' },
                    { title: 'Branch 2' }
                ]
            }
        }]
    });
    console.log('✓ 文件创建成功\n');
    
    // 验证文件
    const stats = await fs.stat(outputPath);
    console.log('文件大小:', stats.size, 'bytes');
    
    const zip = new AdmZip(outputPath);
    console.log('\nZIP 内容:');
    const entries = zip.getEntries();
    entries.forEach(e => console.log('  -', e.entryName));
    
    // 检查 metadata
    const metadata = zip.readAsText('metadata.xml');
    console.log('\nmetadata.xml 内容:');
    console.log(metadata);
    
    // 检查 content.xml
    const content = zip.readAsText('content.xml');
    console.log('\ncontent.xml 检查:');
    console.log('  ✓ attributedTitle:', content.includes('attributedTitle'));
    console.log('  ✓ importantTopic:', content.includes('importantTopic'));
    console.log('  ✓ minorTopic:', content.includes('minorTopic'));
    console.log('  ✓ rainbow theme:', content.includes('rainbow'));
    
    // 检查 styles.xml
    const styles = zip.readAsText('styles.xml');
    console.log('\nstyles.xml 检查:');
    console.log('  ✓ rainbow theme styles:', styles.includes('rainbow'));
    
    // 检查 content.xml 兼容性文件
    console.log('\n检查完整 XMind 兼容性文件...');
    let hasContentXml = false;
    let hasMetadataV2 = false;
    let hasRainbowStyles = false;
    
    for (const e of entries) {
        if (e.entryName === 'content.xml') hasContentXml = true;
        if (e.entryName === 'metadata.xml' && metadata.includes('"dataStructureVersion": "2"')) {
            hasMetadataV2 = true;
        }
        if (e.entryName === 'styles.xml' && styles.includes('rainbow')) {
            hasRainbowStyles = true;
        }
    }
    
    console.log('\n最终检查:');
    console.log('  [x] content.xml 存在:', hasContentXml ? '✅' : '❌');
    console.log('  [x] metadata v2:', hasMetadataV2 ? '✅' : '❌');
    console.log('  [x] rainbow 主题:', hasRainbowStyles ? '✅' : '❌');
    
    console.log('\n🎉 验证完成！文件保存在:', outputPath);
    
}).catch(err => {
    console.error('错误:', err);
});
