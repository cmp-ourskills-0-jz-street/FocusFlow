// API Service for communicating with FastAPI backend
import type { SensorListItem, ApiResponse, SensorInfo, DataStreamType } from '../types';

// Use proxy in dev (empty = same origin), direct URL in production
const API_BASE_URL = window.location.hostname === 'localhost' ? '' : window.location.origin;

export class ApiService {
  /**
   * Get current connection status
   */
  static async getStatus(): Promise<ApiResponse<{ connected: boolean; sensor_info: SensorInfo | null }>> {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    return response.json();
  }

  /**
   * Scan for available BrainBit devices
   */
  static async scanDevices(): Promise<ApiResponse<{ sensors: SensorListItem[]; count: number }>> {
    const response = await fetch(`${API_BASE_URL}/api/scan`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Connect to a specific sensor
   */
  static async connectDevice(sensorIndex: number): Promise<ApiResponse<{ sensor_info: SensorInfo }>> {
    const response = await fetch(`${API_BASE_URL}/api/connect/${sensorIndex}`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Disconnect from current sensor
   */
  static async disconnectDevice(): Promise<ApiResponse<{}>> {
    const response = await fetch(`${API_BASE_URL}/api/disconnect`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Start data streaming
   */
  static async startDataStream(dataType: DataStreamType): Promise<ApiResponse<{}>> {
    const response = await fetch(`${API_BASE_URL}/api/start/${dataType}`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Stop data streaming
   */
  static async stopDataStream(dataType: DataStreamType): Promise<ApiResponse<{}>> {
    const response = await fetch(`${API_BASE_URL}/api/stop/${dataType}`, {
      method: 'POST',
    });
    return response.json();
  }
}
