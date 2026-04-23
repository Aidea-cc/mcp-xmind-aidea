#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';

// 直接导入并测试我们的核心代码
async function testFormat() {
    console.log('=== XMind 格式简单验证 ===\n');
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xmind-simple-'));
    const outputPath = path.join(tempDir, 'test.xmind');
    
    try {
        // 直接测试 index.ts 里的 createXMind 函数
        console.log('导入模块...');
        
        // 模拟创建文件（使用实际的 createXMind 逻辑）
        const { createXMind } = await import('./index.js');
        
        console.log('创建 XMind 文件...');
        
        await createXMind(outputPath, {
            sheets: [{
                title: '测试画布',
                theme: 'rainbow',
                rootTopic: {
                    title: '中心主题',
                    topicClass: 'importantTopic',
                    children: [
                        { title: '分支 1', topicClass: 'minorTopic' },
                        { title: '分支 2' }
                    ]
                }
            }]
        });
        
        console.log('✓ 文件创建成功\n');
        
        // 检查生成的文件
        const stats = await fs.stat(outputPath);
        console.log(`✓ 文件大小: ${stats.size} bytes\n`);
        
        const zip = new AdmZip(outputPath);
        const entries = zip.getEntries();
        
        console.log('文件结构:');
        entries.forEach(e => console.log(`  - ${e.entryName}`));
        console.log();
        
        // 检查 metadata
        const metadata = zip.readAsText('metadata.xml');
        console.log('metadata.xml:');
        console.log(metadata);
        console.log();
        
        // 检查 content.xml
        const content = zip.readAsText('content.xml');
        console.log('content.xml (节选):');
        console.log(content.substring(0, 1000));
        console.log();
        
        // 检查 styles
        const styles = zip.readAsText('styles.xml');
        console.log('styles.xml 包含 rainbow:', styles.includes('rainbow'));
        
        console.log('\n🎉 验证完成！文件保存在:', outputPath);
        
    } catch (error) {
        console.error('错误:', error);
        throw error;
    }
}

testFormat();
