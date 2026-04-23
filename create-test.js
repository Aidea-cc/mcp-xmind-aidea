#!/usr/bin/env node
import { createXMind } from './dist/index.js';

async function createTestFile() {
    console.log('=== 创建测试 XMind 文件 ===\n');
    
    const outputPath = '/workspace/test-validation.xmind';
    
    try {
        await createXMind(outputPath, {
            sheets: [{
                title: '验证测试',
                theme: 'rainbow',
                rootTopic: {
                    title: 'XMind 格式验证',
                    topicClass: 'importantTopic',
                    children: [
                        {
                            title: '格式兼容性',
                            children: [
                                { title: 'attributedTitle' },
                                { title: 'content.xml' },
                                { title: 'metadata v2' }
                            ]
                        },
                        {
                            title: '主题样式',
                            children: [
                                { title: 'Rainbow 主题' },
                                { title: 'importantTopic' },
                                { title: 'minorTopic' }
                            ]
                        },
                        {
                            title: '功能验证',
                            children: [
                                { title: '多层级结构' },
                                { title: '节点类型' },
                                { title: '完整格式' }
                            ]
                        }
                    ]
                }
            }]
        });
        
        console.log('✅ XMind 文件创建成功！');
        console.log('文件路径:', outputPath);
        
        // 检查文件
        const fs = require('fs');
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log('文件大小:', stats.size, 'bytes');
            console.log('\n请下载此文件并在 XMind 中打开验证。');
        }
        
    } catch (error) {
        console.error('创建失败:', error);
    }
}

createTestFile();
