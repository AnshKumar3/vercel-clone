const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Import UUID for unique container names
const app = express();
const port = 3002;
const http = require('http');

const docker = new Docker();
let clients = [];

app.use(cors());
app.use(express.json());

// Pool of available ports
const availablePorts = Array.from({ length: 10 }, (_, i) => 3005 + i); // Ports 3005 to 3014

app.post('/run', async (req, res) => {
    const { repoUrl, projectType } = req.body;

    if (!repoUrl || !projectType) {
        return res.status(400).send('Repository URL and project type are required');
    }

    if (availablePorts.length === 0) {
        return res.status(500).send('No available ports');
    }

    try {
        const containerName = `container_${uuidv4()}`; // Generate a unique container name
        const hostPort = availablePorts.shift(); // Get an available port

        // Determine the port to expose based on project type
        let exposedPort, portBindings;
        if (projectType === 'vite') {
            exposedPort = '5173/tcp';
            portBindings = { '5173/tcp': [{ HostPort: `${hostPort}` }] };
        } else if (projectType === 'react') {
            exposedPort = '3000/tcp';
            portBindings = { '3000/tcp': [{ HostPort: `${hostPort}` }] };
        } else {
            return res.status(400).send('Invalid project type');
        }

        // Create a new Docker container using the custom image
        const container = await docker.createContainer({
            Image: 'custom-node-cloudflared', // Use the custom image
            Cmd: ['sh', '-c', 'while true; do sleep 1000; done'],
            Tty: true,
            WorkingDir: '/app',
            name: containerName, // Assign the unique container name
            ExposedPorts: { [exposedPort]: {} }, // Expose the selected port
            HostConfig: {
                PortBindings: portBindings,
                NetworkMode: 'my_custom_network'
            }
        });

        // Start the container
        await container.start();

        // Run Cloudflare tunnel command inside the container
        const cloudflaredCmd = `cloudflared tunnel --url http://localhost:${exposedPort}`;
        const cloudflaredExec = await container.exec({
            Cmd: ['sh', '-c', cloudflaredCmd],
            AttachStdout: true,
            AttachStderr: true,
            NetworkMode: 'my_custom_network' 
        });

        const cloudflaredStream = await cloudflaredExec.start();

        cloudflaredStream.on('data', (data) => {
            const log = data.toString();
            console.log(log);

            // Extract the tunnel URL from the logs
            const tunnelUrlMatch = log.match(/https:\/\/[^\s]+trycloudflare.com/);
            sendEventToAllClients(tunnelUrlMatch);
            if (tunnelUrlMatch) {
                const tunnelUrl = tunnelUrlMatch[0];
                console.log(`Cloudflare tunnel created: ${tunnelUrl}`);
                if (!res.headersSent) {
                    res.send(`Container ${containerName} started and application running. Access it at  <a href="${tunnelUrl}" target="_blank">${tunnelUrl}</a>`);
                }
            }
        });

        cloudflaredStream.on('end', () => {
            console.log('Cloudflare tunnel command execution ended');
        });

        // Determine the command based on project type
        let installAndRunCmd;
        if (projectType === 'vite') {
            installAndRunCmd = `npm cache clean --force && apk add git && git clone ${repoUrl} /app && cd /app && npm install && npm run build && npm run dev -- --host`;
        } else if (projectType === 'react') {
            installAndRunCmd = `npm cache clean --force && apk add git && git clone ${repoUrl} /app && cd /app && npm install && npm run build && npm start`;
        }

        // Clone the repository and install dependencies inside the container
        const execInstance = await container.exec({
            Cmd: ['sh', '-c', installAndRunCmd],
            AttachStdout: true,
            AttachStderr: true
        });

        const execStream = await execInstance.start();

        execStream.on('data', (data) => {
            console.log(data.toString());
        });

        execStream.on('end', () => {
            console.log('Repository cloned and dependencies installed');
        });

    } catch (error) {
        console.error('Error starting container:', error);
        res.status(500).send('Error starting container');
    }
});
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
    });
});

http.createServer((req, res) => {
    if (req.url === '/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        clients.push(res);

        req.on('close', () => {
            clients.splice(clients.indexOf(res), 1);
        });
    }
}).listen(8000);

function sendEventToAllClients(message) {
    clients.forEach(client => client.res.write(`data: ${JSON.stringify({ message })}\n\n`));
}
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
