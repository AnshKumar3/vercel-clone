document.getElementById('repoForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const repoUrl = document.getElementById('repoUrl').value;
    const output = document.getElementById('output');
    output.innerHTML = 'Starting container...';

    try {
        const response = await fetch('https://nirvana-healthy-rescue-restrict.trycloudflare.com/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ repoUrl })
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
