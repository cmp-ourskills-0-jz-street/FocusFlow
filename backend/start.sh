#!/bin/bash

# Start script for NeuroHren backend

echo "Starting NeuroHren Backend Server..."
echo "Make sure you have installed the dependencies:"
echo "  pip install -r requirements.txt"
echo ""
echo "The backend will be available at http://localhost:8000"
echo "API documentation at http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd "$(dirname "$0")"
python main.py
