document.getElementById('createRoom').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/create-room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (data.roomId) {
            window.location.href = `/game/${data.roomId}`;
        }
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create game room. Please try again.');
    }
});