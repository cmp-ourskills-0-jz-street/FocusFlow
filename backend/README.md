# FocusFlow Backend

FastAPI backend for BrainBit neurointerface integration.

## Features

- Real-time BrainBit device scanning and connection
- WebSocket support for live data streaming
- RESTful API for device control
- Signal, resistance, and spectrum data streaming
- Based on the PyQt BrainBitDemo implementation

## Requirements

- Python 3.7+
- BrainBit device
- pyneurosdk2 library

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. For Linux (Astra Linux), additionally install system packages:
```bash
sudo apt install ./libneurosdk2.deb
```

Download packages from [here](https://github.com/BrainbitLLC/linux_neurosdk2/tree/main/package).

## Running

Start the server:
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

### REST API

- `GET /` - API information
- `GET /api/status` - Get connection status
- `POST /api/scan` - Scan for devices
- `POST /api/connect/{sensor_index}` - Connect to device
- `POST /api/disconnect` - Disconnect from device
- `POST /api/start/{data_type}` - Start data streaming (signal, resist)
- `POST /api/stop/{data_type}` - Stop data streaming

### WebSocket

- `WS /ws` - WebSocket endpoint for real-time data streaming

## WebSocket Message Format

### From Server

```json
{
  "type": "signal",
  "data": [
    {"O1": 123.45, "O2": 234.56, "T3": 345.67, "T4": 456.78}
  ]
}
```

```json
{
  "type": "resist",
  "data": {
    "O1": 1000000,
    "O2": 1500000,
    "T3": 1200000,
    "T4": 1300000
  }
}
```

```json
{
  "type": "status",
  "data": {
    "type": "state_changed",
    "state": "in_range"
  }
}
```

### From Client

```json
{
  "type": "ping"
}
```

Response:
```json
{
  "type": "pong"
}
```

## Development

The backend includes mock classes for development without hardware. The neurosdk library will be imported if available, otherwise mock classes will be used.

## Interactive API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
