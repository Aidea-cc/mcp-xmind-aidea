#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { spawn, ChildProcess } from 'child_process';

async function verifyXMindFormat() {
    console.log('=== XMind 文件格式验证 ===\n');

    // 1. 创建临时目录
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xmind-verify-'));
    const outputPath = path.join(tempDir, 'test-output.xmind');
    
    try {
        // 2. 启动 MCP 服务器
        console.log('启动 MCP 服务器...');
        const serverPath = path.join(process.cwd(), 'dist', 'index.js');
        const server: ChildProcess = spawn('node', [serverPath, tempDir], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // 3. 准备创建 XMind 的请求
        const createRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'create_xmind',
                arguments: {
                    path: outputPath,
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
                }
            }
        };

        console.log('创建 XMind 文件...');

        // 4. 发送请求到服务器
        const requestPromise = new Promise<void>((resolve, reject) => {
            let responseBuffer = '';
            
            server.stdout?.on('data', (data: Buffer) => {
                responseBuffer += data.toString();
                try {
                    if (responseBuffer.includes('"jsonrpc": "2.0"')) {
                        console.log('XMind 文件创建成功！\n');
                        resolve();
                    }
                } catch (e) {
                    // 继续接收数据
                }
            });

            server.stderr?.on('data', (data) => {
                console.log('服务器:', data.toString());
            });

            server.on('error', reject);
            server.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`服务器退出，代码: ${code}`));
                }
            });

            // 发送请求
            server.stdin?.write(JSON.stringify(createRequest) + '\n');
        });

        // 设置超时
        const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('请求超时')), 10000);
        });

        await Promise.race([requestPromise, timeoutPromise]);
        server.kill();

        // 5. 验证生成的文件
        console.log('验证生成的文件格式...\n');
        
        if (!await fs.access(outputPath).then(() => true).catch(() => false)) {
            throw new Error('XMind 文件未创建');
        }

        const stats = await fs.stat(outputPath);
        console.log(`✓ 文件大小: ${stats.size} bytes`);

        // 6. 解压并检查内容
        const zip = new AdmZip(outputPath);
        const zipEntries = zip.getEntries();
        
        console.log(`✓ ZIP 包含 ${zipEntries.length} 个文件\n`);
        
        console.log('ZIP 内容列表:');
        zipEntries.forEach((entry) => {
            console.log(`  - ${entry.entryName}`);
        });
        console.log();

        // 检查必需的文件
        const requiredFiles = [
            'content.xml',
            'manifest.xml',
            'metadata.xml',
            'styles.xml'
        ];

        let allRequired = true;
        for (const file of requiredFiles) {
            const exists = zipEntries.some(e => e.entryName === file);
            console.log(`${exists ? '✓' : '✗'} ${file}`);
            if (!exists) allRequired = false;
        }
        console.log();

        if (!allRequired) {
            throw new Error('缺少必需的文件');
        }

        // 7. 检查 metadata.xml
        const metadataContent = zip.readAsText('metadata.xml');
        console.log('metadata.xml 内容:');
        console.log(metadataContent.substring(0, 500) + (metadataContent.length > 500 ? '...' : ''));
        console.log();

        if (metadataContent.includes('"dataStructureVersion": "2"')) {
            console.log('✓ dataStructureVersion = "2"');
        } else {
            console.log('✗ dataStructureVersion 不正确');
            allRequired = false;
        }

        if (metadataContent.includes('"creator": "Vana"')) {
            console.log('✓ creator = "Vana"');
        } else {
            console.log('✗ creator 不正确');
            allRequired = false;
        }

        if (metadataContent.includes('"layoutEngineVersion": "3"')) {
            console.log('✓ layoutEngineVersion = "3"');
        } else {
            console.log('✗ layoutEngineVersion 不正确');
            allRequired = false;
        }
        console.log();

        // 8. 检查 content.xml
        const contentXml = zip.readAsText('content.xml');
        console.log('content.xml 检查:');
        
        if (contentXml.includes('attributedTitle')) {
            console.log('✓ attributedTitle 存在');
        } else {
            console.log('✗ attributedTitle 不存在');
            allRequired = false;
        }
        
        if (contentXml.includes('topicClass="importantTopic"')) {
            console.log('✓ importantTopic 存在');
        } else {
            console.log('✗ importantTopic 不存在');
            allRequired = false;
        }
        
        if (contentXml.includes('topicClass="minorTopic"')) {
            console.log('✓ minorTopic 存在');
        } else {
            console.log('✗ minorTopic 不存在');
            allRequired = false;
        }
        
        if (contentXml.includes('rainbow')) {
            console.log('✓ rainbow 主题存在');
        } else {
            console.log('✗ rainbow 主题不存在');
            allRequired = false;
        }
        console.log();

        // 9. 检查 styles.xml
        const stylesXml = zip.readAsText('styles.xml');
        console.log('styles.xml 检查:');
        
        if (stylesXml.includes('rainbow')) {
            console.log('✓ rainbow 主题样式完整');
        } else {
            console.log('✗ rainbow 主题样式不完整');
            allRequired = false;
        }
        console.log();

        if (allRequired) {
            console.log('🎉 所有格式检查通过！');
        } else {
            throw new Error('部分格式检查失败');
        }

        // 显示生成的文件路径
        console.log(`\n生成的文件: ${outputPath}`);
        return outputPath;

    } finally {
        // 清理 - 保留临时文件用于进一步检查
        // await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`\n临时文件保存在: ${tempDir}`);
    }
}

verifyXMindFormat().catch((error) => {
    console.error('验证失败:', error);
    process.exit(1);
});
