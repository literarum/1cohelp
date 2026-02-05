@echo off
echo Starting local HTTP server on port 8000...
echo Open http://localhost:8000 in your browser
echo Press Ctrl+C to stop the server
python -m http.server 8000
