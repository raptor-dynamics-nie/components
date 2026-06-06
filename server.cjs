const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In pkg, we want data.json to be saved where the executable is located
const executablePath = process.cwd();
const dataFile = path.join(executablePath, 'data.json');

// Initialize data.json if it doesn't exist
if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([]));
}

app.get('/api/components', (req, res) => {
    try {
        const data = fs.readFileSync(dataFile, 'utf-8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

app.post('/api/components', (req, res) => {
    try {
        const components = req.body;
        fs.writeFileSync(dataFile, JSON.stringify(components, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Serve static frontend files
// When running locally with node server.cjs it uses the current directory's dist
// When packaged with pkg, __dirname becomes the snapshot root
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all route for SPA navigation
app.use((req, res) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    } else {
        res.status(404).json({ error: 'Not Found' });
    }
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

const hostIP = getLocalIP();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`🚀 Raptor Dynamics Component Manager Server Running!`);
    console.log(`💻 Access on your PC: http://localhost:${PORT}`);
    console.log(`📱 Access on Mobile : http://${hostIP}:${PORT}`);
    console.log(`=========================================`);
    console.log(`Data will be saved in: ${dataFile}`);
    console.log(`Do not close this window while using the app.`);
});
