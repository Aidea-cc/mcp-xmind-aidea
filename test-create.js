#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// 导入我们的模块
import { createXMind } from './dist/index.js';

async function createTestXMind() {
    console.log('=== 创建测试 XMind 文件 ===\n');
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xmind-test-'));
    const outputPath = path.join(tempDir, '测试文档.xmind');
    
    try {
        // 创建测试内容
        await createXMind(outputPath, {
            sheets: [{
                title: '测试画布',
                theme: 'rainbow',
                rootTopic: {
                    title: '中心主题',
                    topicClass: 'importantTopic',
                    children: [
                        {
                            title: '分支 1',
                            topicClass: 'minorTopic',
                            children: [
                                { title: '子分支 1-1' },
                                { title: '子分支 1-2' }
                            ]
                        },
                        {
                            title: '分支 2',
                            children: [
                                { title: '子分支 2-1' }
                            ]
                        }
                    ]
                }
            }]
        });
        
        console.log('✅ XMind 文件创建成功！');
        console.log('文件路径:', outputPath);
        
        // 检查文件大小
        const stats = await fs.stat(outputPath);
        console.log('文件大小:', stats.size, 'bytes');
        
        console.log('\n请下载此文件并在 XMind 中打开测试。');
        
    } catch (error) {
        console.error('创建失败:', error);
    }
}

createTestXMind();
