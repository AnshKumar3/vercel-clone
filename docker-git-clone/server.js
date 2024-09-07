const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Import UUID for unique container names
const app = express();
const port = 3002;

const docker = new Docker();

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

        // Create a new Docker container
        const container = await docker.createContainer({
            Image: 'node:lts-alpine3.20', // Use a Node.js base image
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

        // Connect the container to your custom network
        

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

        const stream = await execInstance.start();

        stream.on('data', (data) => {
            console.log(data.toString());
        });

        stream.on('end', () => {
            res.send(`Container ${containerName} started and application running. Access it at http://localhost:${hostPort}`);
        });

        // Release the port when the container stops
        container.on('stop', () => {
            availablePorts.push(hostPort);
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});



app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
