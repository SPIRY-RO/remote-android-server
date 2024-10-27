const express = require('express');
const path = require('path');

const app = express();
const PORT = 3005;

// Serve static files from the 'files' directory
app.use(express.static(path.join(__dirname, 'page')));

// Define a route to serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'page', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
