document.getElementById('repoForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const repoUrl = document.getElementById('repoUrl').value;
    const projectType = document.getElementById('projectType').value;

    const output = document.getElementById('output');
    output.innerHTML = 'Starting container...';

    try {
        

        const response = await fetch('http://localhost:3002/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ repoUrl,projectType }),
            

        });

        if (response.ok) {
            const message = await response.text();
            output.innerHTML = message;
        } else {
            const error = await response.text();
            output.innerHTML = `Error: ${error}`;
        }
    } catch (error) {
        output.innerHTML = `Error: ${error.message}`;
    }
});
