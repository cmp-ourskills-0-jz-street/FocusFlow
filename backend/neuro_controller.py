"""
Neuro Controller for FastAPI backend
Manages BrainBit device connection and data streaming
Based on the PyQt BrainBitDemo implementation
"""
from typing import List, Optional, Callable, Dict, Any
from threading import Thread
import asyncio
import logging
from fastapi import WebSocket

from emotions_controller import EmotionsController

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from neurosdk.scanner import Scanner
    from neurosdk.sensor import Sensor
    from neurosdk.cmn_types import *
except (ImportError, OSError) as e:
    logger.warning(f"neurosdk not available ({e}). Using mock classes for development.")
    # Mock classes for development without hardware
    import random
    import time
    from threading import Thread, Event
    
    class MockSensorInfo:
        def __init__(self, index):
            self.Name = f"MockBrainBit-{index}"
            self.Address = f"00:11:22:33:44:{index:02d}"
            self.SerialNumber = f"MB{1000 + index}"
    
    class MockSignalData:
        def __init__(self):
            # Generate realistic EEG-like signal data (microvolts range)
            base = random.uniform(-50, 50)
            noise = random.uniform(-20, 20)
            self.O1 = base + noise + random.uniform(-10, 10)
            self.O2 = base + noise + random.uniform(-10, 10)
            self.T3 = base + noise + random.uniform(-10, 10)
            self.T4 = base + noise + random.uniform(-10, 10)
    
    class MockResistData:
        def __init__(self):
            # Generate realistic resistance data (ohms)
            # Range: 1,500,000 - 3,000,000 ohms
            # Good contact: > 2,000,000 ohms, Poor: <= 2,000,000 ohms
            self.O1 = random.uniform(1_500_000, 3_000_000)
            self.O2 = random.uniform(1_500_000, 3_000_000)
            self.T3 = random.uniform(1_500_000, 3_000_000)
            self.T4 = random.uniform(1_500_000, 3_000_000)
    
    class MockSensor:
        def __init__(self, info):
            self.name = info.Name
            self.address = info.Address
            self.serial_number = info.SerialNumber
            self.state = "in_range"
            self.batt_power = random.randint(70, 100)
            self.signalDataReceived = None
            self.resistDataReceived = None
            self.sensorStateChanged = None
            self.batteryChanged = None
            self._signal_thread = None
            self._resist_thread = None
            self._stop_signal = Event()
            self._stop_resist = Event()
        
        def exec_command(self, command):
            if command == "start_signal":
                self._start_signal_stream()
            elif command == "stop_signal":
                self._stop_signal_stream()
            elif command == "start_resist":
                self._start_resist_stream()
            elif command == "stop_resist":
                self._stop_resist_stream()
        
        def _start_signal_stream(self):
            if self._signal_thread and self._signal_thread.is_alive():
                return
            self._stop_signal.clear()
            self._signal_thread = Thread(target=self._generate_signal_data)
            self._signal_thread.daemon = True
            self._signal_thread.start()
        
        def _stop_signal_stream(self):
            self._stop_signal.set()
            if self._signal_thread:
                self._signal_thread.join(timeout=1)
        
        def _generate_signal_data(self):
            # Simulate 250 Hz sampling rate with batches of 25 samples
            while not self._stop_signal.is_set():
                if self.signalDataReceived:
                    # Generate a batch of 25 samples (typical for BrainBit)
                    batch = [MockSignalData() for _ in range(25)]
                    self.signalDataReceived(self, batch)
                time.sleep(0.1)  # 100ms delay between batches
        
        def _start_resist_stream(self):
            if self._resist_thread and self._resist_thread.is_alive():
                return
            self._stop_resist.clear()
            self._resist_thread = Thread(target=self._generate_resist_data)
            self._resist_thread.daemon = True
            self._resist_thread.start()
        
        def _stop_resist_stream(self):
            self._stop_resist.set()
            if self._resist_thread:
                self._resist_thread.join(timeout=1)
        
        def _generate_resist_data(self):
            # Resistance updates every second
            while not self._stop_resist.is_set():
                if self.resistDataReceived:
                    data = MockResistData()
                    self.resistDataReceived(self, data)
                time.sleep(1.0)
        
        def disconnect(self):
            self._stop_signal_stream()
            self._stop_resist_stream()
            self.state = "out_of_range"
    
    class Scanner:
        def __init__(self, families):
            self.sensorsChanged = None
            self._mock_sensors = [MockSensorInfo(i) for i in range(3)]
        
        def start(self):
            # Simulate finding sensors after a short delay
            if self.sensorsChanged:
                Thread(target=self._simulate_scan).start()
        
        def _simulate_scan(self):
            time.sleep(0.5)  # Simulate scan time
            if self.sensorsChanged:
                self.sensorsChanged(self, self._mock_sensors)
        
        def stop(self): pass
        
        def sensors(self):
            return self._mock_sensors
        
        def create_sensor(self, info):
            return MockSensor(info)
    
    class SensorState:
        StateInRange = "in_range"
        StateOutOfRange = "out_of_range"
    
    class SensorCommand:
        StartSignal = "start_signal"
        StopSignal = "stop_signal"
        StartResist = "start_resist"
        StopResist = "stop_resist"
    
    class SensorFamily:
        LEBrainBit = "brainbit"
        LECallibri = "callibri"


class NeuroController:
    """Controller for BrainBit neurointerface device"""
    
    def __init__(self):
        self._sensor: Optional[Sensor] = None
        self._scanner = Scanner([SensorFamily.LEBrainBit, SensorFamily.LECallibri])
        self._sensors_list: List = []
        self._signal_callback: Optional[Callable] = None
        self._resist_callback: Optional[Callable] = None
        self._status_callback: Optional[Callable] = None
        self._emotions_callback: Optional[Callable] = None
        self._is_scanning = False
        self._emotions_controller = EmotionsController()
        self._is_emotions_active = False
    
    def is_connected(self) -> bool:
        """Check if sensor is connected"""
        return self._sensor is not None and hasattr(self._sensor, 'state') and self._sensor.state == SensorState.StateInRange
    
    def get_sensor_info(self) -> Optional[Dict[str, Any]]:
        """Get information about connected sensor"""
        if self._sensor is None:
            return None
        
        try:
            return {
                "name": getattr(self._sensor, 'name', 'Unknown'),
                "address": getattr(self._sensor, 'address', 'Unknown'),
                "serial_number": getattr(self._sensor, 'serial_number', 'Unknown'),
                "battery": getattr(self._sensor, 'batt_power', 0),
                "state": str(getattr(self._sensor, 'state', 'Unknown'))
            }
        except Exception as e:
            logger.error(f"Error getting sensor info: {e}")
            return None
    
    async def scan_devices(self, duration: int = 5) -> List[Dict[str, str]]:
        """
        Scan for available BrainBit devices
        
        Args:
            duration: Scan duration in seconds
            
        Returns:
            List of found sensors with their info
        """
        self._sensors_list = []
        found_sensors = []
        
        def sensors_found(scanner, sensors):
            self._sensors_list = sensors
        
        self._scanner.sensorsChanged = sensors_found
        
        # Run scanner in thread
        def run_scan():
            self._scanner.start()
            import time
            time.sleep(duration)
            self._scanner.stop()
        
        thread = Thread(target=run_scan)
        thread.start()
        thread.join()
        
        self._scanner.sensorsChanged = None
        
        # Convert sensor info to dict
        for i, sensor in enumerate(self._sensors_list):
            try:
                found_sensors.append({
                    "index": i,
                    "name": getattr(sensor, 'Name', 'Unknown'),
                    "address": getattr(sensor, 'Address', 'Unknown'),
                    "serial_number": getattr(sensor, 'SerialNumber', 'Unknown')
                })
            except Exception as e:
                logger.error(f"Error processing sensor {i}: {e}")
        
        return found_sensors
    
    async def connect_sensor(self, sensor_index: int) -> bool:
        """
        Connect to a sensor by index
        
        Args:
            sensor_index: Index of sensor from scan results
            
        Returns:
            True if connection successful
        """
        if sensor_index >= len(self._sensors_list):
            raise ValueError(f"Invalid sensor index: {sensor_index}")
        
        sensor_info = self._sensors_list[sensor_index]
        
        try:
            self._sensor = self._scanner.create_sensor(sensor_info)
            
            if self._sensor is None:
                return False
            
            # Set up state change callback
            def state_changed(sensor, state):
                if self._status_callback:
                    self._status_callback({
                        "type": "state_changed",
                        "state": str(state)
                    })
            
            self._sensor.sensorStateChanged = state_changed
            
            # Set up battery callback
            def battery_changed(sensor, battery):
                if self._status_callback:
                    self._status_callback({
                        "type": "battery_changed",
                        "battery": battery
                    })
            
            self._sensor.batteryChanged = battery_changed
            
            return self.is_connected()
            
        except Exception as e:
            logger.error(f"Error connecting to sensor: {e}")
            return False
    
    def disconnect_sensor(self):
        """Disconnect from current sensor"""
        if self._sensor is not None:
            try:
                self._sensor.disconnect()
            except Exception as e:
                logger.error(f"Error disconnecting sensor: {e}")
            finally:
                self._sensor = None
    
    def start_signal(self):
        """Start signal data streaming"""
        if not self.is_connected():
            raise RuntimeError("Sensor not connected")
        
        def signal_received(sensor, signal_data):
            if self._signal_callback:
                # Convert signal data to serializable format
                data_list = []
                for sample in signal_data:
                    try:
                        data_list.append({
                            "O1": getattr(sample, 'O1', 0),
                            "O2": getattr(sample, 'O2', 0),
                            "T3": getattr(sample, 'T3', 0),
                            "T4": getattr(sample, 'T4', 0)
                        })
                    except Exception as e:
                        logger.error(f"Error processing signal sample: {e}")
                
                self._signal_callback(data_list)
        
        self._sensor.signalDataReceived = signal_received
        
        def execute_command():
            try:
                self._sensor.exec_command(SensorCommand.StartSignal)
            except Exception as e:
                logger.error(f"Error starting signal: {e}")
        
        thread = Thread(target=execute_command)
        thread.start()
    
    def stop_signal(self):
        """Stop signal data streaming"""
        if not self.is_connected():
            return
        
        def execute_command():
            try:
                self._sensor.exec_command(SensorCommand.StopSignal)
                self._sensor.signalDataReceived = None
            except Exception as e:
                logger.error(f"Error stopping signal: {e}")
        
        thread = Thread(target=execute_command)
        thread.start()
    
    def start_resist(self):
        """Start resistance data streaming"""
        if not self.is_connected():
            raise RuntimeError("Sensor not connected")
        
        def resist_received(sensor, resist_data):
            if self._resist_callback:
                try:
                    data = {
                        "O1": getattr(resist_data, 'O1', float('inf')),
                        "O2": getattr(resist_data, 'O2', float('inf')),
                        "T3": getattr(resist_data, 'T3', float('inf')),
                        "T4": getattr(resist_data, 'T4', float('inf'))
                    }
                    self._resist_callback(data)
                except Exception as e:
                    logger.error(f"Error processing resist data: {e}")
        
        self._sensor.resistDataReceived = resist_received
        
        def execute_command():
            try:
                self._sensor.exec_command(SensorCommand.StartResist)
            except Exception as e:
                logger.error(f"Error starting resist: {e}")
        
        thread = Thread(target=execute_command)
        thread.start()
    
    def stop_resist(self):
        """Stop resistance data streaming"""
        if not self.is_connected():
            return
        
        def execute_command():
            try:
                self._sensor.exec_command(SensorCommand.StopResist)
                self._sensor.resistDataReceived = None
            except Exception as e:
                logger.error(f"Error stopping resist: {e}")
        
        thread = Thread(target=execute_command)
        thread.start()
    
    def start_emotions(self):
        """Start emotions/relaxation data streaming"""
        if not self.is_connected():
            raise RuntimeError("Sensor not connected")
        
        if not self._emotions_controller.is_available():
            raise RuntimeError("Emotions library not available")
        
        # Set up callbacks
        self._emotions_controller.set_emotions_callback(self._on_emotions_data)
        self._emotions_controller.set_calibration_callback(self._on_calibration_data)
        
        # Start calibration
        self._emotions_controller.start_calibration()
        
        # Set up signal data processing for emotions
        def signal_received(sensor, signal_data):
            # Convert signal data to dict format
            data_list = []
            for sample in signal_data:
                try:
                    data_list.append({
                        "O1": getattr(sample, 'O1', 0),
                        "O2": getattr(sample, 'O2', 0),
                        "T3": getattr(sample, 'T3', 0),
                        "T4": getattr(sample, 'T4', 0)
                    })
                except Exception as e:
                    logger.error(f"Error processing signal sample for emotions: {e}")
            
            # Process through emotions controller
            self._emotions_controller.process_data(data_list)
        
        self._sensor.signalDataReceived = signal_received
        self._is_emotions_active = True
        
        def execute_command():
            try:
                self._sensor.exec_command(SensorCommand.StartSignal)
            except Exception as e:
                logger.error(f"Error starting emotions: {e}")
        
        thread = Thread(target=execute_command)
        thread.start()
    
    def stop_emotions(self):
        """Stop emotions/relaxation data streaming"""
        if not self.is_connected():
            return
        
        self._is_emotions_active = False
        
        def execute_command():
            try:
                self._sensor.exec_command(SensorCommand.StopSignal)
                self._sensor.signalDataReceived = None
                self._emotions_controller.clear_callbacks()
            except Exception as e:
                logger.error(f"Error stopping emotions: {e}")
        
        thread = Thread(target=execute_command)
        thread.start()
    
    def _on_emotions_data(self, data):
        """Internal callback for emotions data"""
        if self._emotions_callback:
            self._emotions_callback(data)
    
    def _on_calibration_data(self, data):
        """Internal callback for calibration progress"""
        if self._emotions_callback:
            # Send calibration progress as emotions data
            self._emotions_callback(data)
    
    def set_callbacks(
        self,
        signal_callback: Optional[Callable] = None,
        resist_callback: Optional[Callable] = None,
        status_callback: Optional[Callable] = None,
        emotions_callback: Optional[Callable] = None
    ):
        """Set callbacks for data streaming"""
        if signal_callback:
            self._signal_callback = signal_callback
        if resist_callback:
            self._resist_callback = resist_callback
        if status_callback:
            self._status_callback = status_callback
        if emotions_callback:
            self._emotions_callback = emotions_callback
    
    def clear_callbacks(self):
        """Clear all callbacks"""
        self._signal_callback = None
        self._resist_callback = None
        self._status_callback = None
        self._emotions_callback = None


class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def send_personal(self, message: dict, websocket: WebSocket):
        """Send message to specific client"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending message: {e}")
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)
