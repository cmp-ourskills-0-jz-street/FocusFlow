import { useState, useEffect } from 'react';
import { ApiService } from '../services/api';
import type { SensorListItem } from '../types';

interface DeviceScannerProps {
  onDeviceConnected: () => void;
}

export function DeviceScanner({ onDeviceConnected }: DeviceScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [sensors, setSensors] = useState<SensorListItem[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Automatically scan for devices on component mount
  useEffect(() => {
    handleScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await ApiService.scanDevices();
      if (result.success && result.sensors) {
        setSensors(result.sensors);
      } else {
        setError('Failed to scan devices');
      }
    } catch (err) {
      setError('Error scanning devices: ' + (err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (index: number) => {
    setConnecting(true);
    setError(null);
    try {
      const result = await ApiService.connectDevice(index);
      if (result.success) {
        onDeviceConnected();
      } else {
        setError('Failed to connect to device');
      }
    } catch (err) {
      setError('Error connecting to device: ' + (err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="device-scanner">
      <h2>Device Scanner</h2>
      
      <button 
        onClick={handleScan} 
        disabled={scanning || connecting}
        className="btn btn-primary"
      >
        {scanning ? 'Scanning...' : 'Scan for Devices'}
      </button>

      {error && <div className="error">{error}</div>}

      {sensors.length > 0 && (
        <div className="sensors-list">
          <h3>Found Devices:</h3>
          <ul>
            {sensors.map((sensor) => (
              <li key={sensor.index} className="sensor-item">
                <div className="sensor-info">
                  <strong>{sensor.name}</strong>
                  <span>Serial: {sensor.serial_number}</span>
                  <span>Address: {sensor.address}</span>
                </div>
                <button
                  onClick={() => handleConnect(sensor.index)}
                  disabled={connecting}
                  className="btn btn-success"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
