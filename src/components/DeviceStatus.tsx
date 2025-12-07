import { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import type { SensorInfo } from '../types';

interface DeviceStatusProps {
  onDisconnect: () => void;
}

export function DeviceStatus({ onDisconnect }: DeviceStatusProps) {
  const [sensorInfo, setSensorInfo] = useState<SensorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await ApiService.getStatus();
        const data = result as any;
        if (data.connected && data.sensor_info) {
          setSensorInfo(data.sensor_info);
        }
      } catch (err) {
        console.error('Error fetching status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = async () => {
    try {
      await ApiService.disconnectDevice();
      onDisconnect();
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  };

  if (loading) {
    return <div className="device-status">Loading...</div>;
  }

  if (!sensorInfo) {
    return null;
  }

  return (
    <div className="device-status">
      <h3>Connected Device</h3>
      <div className="status-info">
        <div className="info-row">
          <span className="label">Name:</span>
          <span className="value">{sensorInfo.name}</span>
        </div>
        <div className="info-row">
          <span className="label">Serial:</span>
          <span className="value">{sensorInfo.serial_number}</span>
        </div>
        <div className="info-row">
          <span className="label">Address:</span>
          <span className="value">{sensorInfo.address}</span>
        </div>
        {sensorInfo.battery !== undefined && (
          <div className="info-row">
            <span className="label">Battery:</span>
            <span className="value">{sensorInfo.battery}%</span>
          </div>
        )}
        <div className="info-row">
          <span className="label">State:</span>
          <span className="value">{sensorInfo.state}</span>
        </div>
      </div>
      <button onClick={handleDisconnect} className="btn btn-danger">
        Disconnect
      </button>
    </div>
  );
}
