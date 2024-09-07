const express = require('express');
const Docker = require('dockerode');
const app = express();
const port = 3002;
const cors = require('cors');

const docker = new Docker();

app.use(express.json());
app.use(cors()); // Add this line

app.post('/run', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl) {
        return res.status(400).send('Repository URL is required');
    }

    try {
        // Create a new Docker container
        const container = await docker.createContainer({
            Image: 'node:lts-alpine3.20', // Use a Node.js base image
            Cmd: ['sh', '-c', 'while true; do sleep 1000; done'],
            Tty: true,  WorkingDir: '/app',
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
                PortBindings: { '3000/tcp': [{ HostPort: '3005' }] }
            }
        });

        // Start the container
        await container.start();

        // Clone the repository and install Next.js inside the container
        const execInstance = await container.exec({
            Cmd: ['sh', '-c', `npm cache clean --force && apk add git && git clone ${repoUrl} /app && cd /app && npm install next && npm install && npm run build && npm start`],
            AttachStdout: true,
            AttachStderr: true
        });

        const stream = await execInstance.start();

        stream.on('data', (data) => {
            console.log(data.toString());
        });

        stream.on('end', () => {
            res.send(`Container started and application running. Access it at http://localhost:3001`);
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
