import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ApiService } from '../services/api';
import { wsService, MessageHandler } from '../services/websocket';
import type { SignalData, WebSocketMessage } from '../types';

export function SignalViewer() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [signalData, setSignalData] = useState<Array<SignalData & { time: number }>>([]);
  const maxDataPoints = 100;

  useEffect(() => {
    const handler: MessageHandler = (message: WebSocketMessage) => {
      if (message.type === 'signal' && Array.isArray(message.data)) {
        setSignalData(prev => {
          const now = Date.now();
          const newData = (message.data as SignalData[]).map((sample: SignalData, index: number) => ({
            ...sample,
            time: now + index
          }));
          
          const combined = [...prev, ...newData];
          return combined.slice(-maxDataPoints);
        });
      }
    };

    wsService.addMessageHandler(handler);
    return () => wsService.removeMessageHandler(handler);
  }, []);

  const handleStartStop = async () => {
    try {
      if (isStreaming) {
        await ApiService.stopDataStream('signal');
        setIsStreaming(false);
        setSignalData([]);
      } else {
        await ApiService.startDataStream('signal');
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Error toggling signal stream:', err);
    }
  };

  return (
    <div className="signal-viewer">
      <div className="header">
        <h3>Signal Data</h3>
        <button onClick={handleStartStop} className="btn btn-primary">
          {isStreaming ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="charts-container">
        <div className="chart">
          <h4>O1 Channel</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={signalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="O1" stroke="#8884d8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart">
          <h4>O2 Channel</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={signalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="O2" stroke="#82ca9d" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart">
          <h4>T3 Channel</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={signalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="T3" stroke="#ffc658" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart">
          <h4>T4 Channel</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={signalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="T4" stroke="#ff7c7c" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
