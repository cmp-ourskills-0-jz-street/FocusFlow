"""
FastAPI backend for FocusFlow - BrainBit neurointerface web application
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from contextlib import asynccontextmanager
import asyncio
import json
from datetime import datetime

from neuro_controller import NeuroController, ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    yield
    # Shutdown
    neuro_controller.disconnect_sensor()


app = FastAPI(
    title="FocusFlow API",
    description="FastAPI backend for BrainBit neurointerface integration",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware to allow frontend connections
# IMPORTANT: In production, replace allow_origins=["*"] with specific frontend URLs
# Example: allow_origins=["https://yourfrontend.com", "https://app.yourfrontend.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Configure with specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global controller and connection manager
neuro_controller = NeuroController()
connection_manager = ConnectionManager()


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "FocusFlow API",
        "version": "1.0.0",
        "description": "BrainBit neurointerface backend",
        "endpoints": {
            "scan": "/api/scan",
            "connect": "/api/connect/{sensor_index}",
            "disconnect": "/api/disconnect",
            "status": "/api/status",
            "websocket": "/ws"
        }
    }


@app.get("/api/status")
async def get_status():
    """Get current connection status"""
    return {
        "connected": neuro_controller.is_connected(),
        "sensor_info": neuro_controller.get_sensor_info(),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/scan")
async def scan_devices():
    """Scan for available BrainBit devices"""
    try:
        sensors = await neuro_controller.scan_devices()
        return {
            "success": True,
            "sensors": sensors,
            "count": len(sensors)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/connect/{sensor_index}")
async def connect_device(sensor_index: int):
    """Connect to a specific sensor by index"""
    try:
        success = await neuro_controller.connect_sensor(sensor_index)
        if success:
            return {
                "success": True,
                "message": "Connected successfully",
                "sensor_info": neuro_controller.get_sensor_info()
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to connect to sensor")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/disconnect")
async def disconnect_device():
    """Disconnect from current sensor"""
    try:
        neuro_controller.disconnect_sensor()
        return {
            "success": True,
            "message": "Disconnected successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/start/{data_type}")
async def start_data_stream(data_type: str):
    """
    Start streaming data of specified type
    Types: signal, resist, spectrum, emotions
    """
    try:
        if data_type == "signal":
            neuro_controller.start_signal()
        elif data_type == "resist":
            neuro_controller.start_resist()
        elif data_type == "emotions":
            neuro_controller.start_emotions()
        else:
            raise HTTPException(status_code=400, detail=f"Unknown data type: {data_type}")
        
        return {
            "success": True,
            "message": f"Started {data_type} streaming"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stop/{data_type}")
async def stop_data_stream(data_type: str):
    """
    Stop streaming data of specified type
    """
    try:
        if data_type == "signal":
            neuro_controller.stop_signal()
        elif data_type == "resist":
            neuro_controller.stop_resist()
        elif data_type == "emotions":
            neuro_controller.stop_emotions()
        else:
            raise HTTPException(status_code=400, detail=f"Unknown data type: {data_type}")
        
        return {
            "success": True,
            "message": f"Stopped {data_type} streaming"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time data streaming
    Streams: signal data, resistance data, spectrum data, emotions
    """
    await connection_manager.connect(websocket)
    
    # Get the running event loop for this coroutine
    loop = asyncio.get_running_loop()
    
    # Set up callbacks to send data through websocket
    # These callbacks are called from neurosdk threads, so we need to use
    # run_coroutine_threadsafe to schedule them in the main event loop
    def send_signal(data):
        asyncio.run_coroutine_threadsafe(
            connection_manager.send_personal(
                {"type": "signal", "data": data},
                websocket
            ),
            loop
        )
    
    def send_resist(data):
        asyncio.run_coroutine_threadsafe(
            connection_manager.send_personal(
                {"type": "resist", "data": data},
                websocket
            ),
            loop
        )
    
    def send_status(data):
        asyncio.run_coroutine_threadsafe(
            connection_manager.send_personal(
                {"type": "status", "data": data},
                websocket
            ),
            loop
        )
    
    def send_emotions(data):
        asyncio.run_coroutine_threadsafe(
            connection_manager.send_personal(
                {"type": "emotions", "data": data},
                websocket
            ),
            loop
        )
    
    neuro_controller.set_callbacks(
        signal_callback=send_signal,
        resist_callback=send_resist,
        status_callback=send_status,
        emotions_callback=send_emotions
    )
    
    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types from client
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
        neuro_controller.clear_callbacks()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
