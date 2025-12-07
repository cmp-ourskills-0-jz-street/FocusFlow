import { useState, useEffect } from 'react';
import { ApiService } from '../services/api';
import { wsService, MessageHandler } from '../services/websocket';
import type { ResistData, WebSocketMessage } from '../types';

export function ResistanceViewer() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [resistData, setResistData] = useState<ResistData | null>(null);
  const normalResistBorder = 2_000_000;

  useEffect(() => {
    const handler: MessageHandler = (message: WebSocketMessage) => {
      if (message.type === 'resist' && !Array.isArray(message.data)) {
        setResistData(message.data as ResistData);
      }
    };

    wsService.addMessageHandler(handler);
    return () => wsService.removeMessageHandler(handler);
  }, []);

  const handleStartStop = async () => {
    try {
      if (isStreaming) {
        await ApiService.stopDataStream('resist');
        setIsStreaming(false);
        setResistData(null);
      } else {
        await ApiService.startDataStream('resist');
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Error toggling resistance stream:', err);
    }
  };

  const getQuality = (value: number): string => {
    if (value === Infinity || value === -Infinity || isNaN(value)) {
      return 'Poor';
    }
    return value > normalResistBorder ? 'Good' : 'Poor';
  };

  const formatValue = (value: number): string => {
    if (value === Infinity || value === -Infinity) {
      return 'inf';
    }
    if (isNaN(value)) {
      return 'N/A';
    }
    return value.toFixed(0);
  };

  const displayData = resistData || { O1: Infinity, O2: Infinity, T3: Infinity, T4: Infinity };

  return (
    <div className="resistance-viewer">
      <div className="header">
        <h3>Resistance Data</h3>
        <button onClick={handleStartStop} className="btn btn-primary">
          {isStreaming ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="resistance-grid">
        <div className="resistance-item">
          <h4>O1</h4>
          <div className="value">{formatValue(displayData.O1)} Ω</div>
          <div className={`quality ${getQuality(displayData.O1).toLowerCase()}`}>
            {getQuality(displayData.O1)}
          </div>
        </div>

        <div className="resistance-item">
          <h4>O2</h4>
          <div className="value">{formatValue(displayData.O2)} Ω</div>
          <div className={`quality ${getQuality(displayData.O2).toLowerCase()}`}>
            {getQuality(displayData.O2)}
          </div>
        </div>

        <div className="resistance-item">
          <h4>T3</h4>
          <div className="value">{formatValue(displayData.T3)} Ω</div>
          <div className={`quality ${getQuality(displayData.T3).toLowerCase()}`}>
            {getQuality(displayData.T3)}
          </div>
        </div>

        <div className="resistance-item">
          <h4>T4</h4>
          <div className="value">{formatValue(displayData.T4)} Ω</div>
          <div className={`quality ${getQuality(displayData.T4).toLowerCase()}`}>
            {getQuality(displayData.T4)}
          </div>
        </div>
      </div>

      {!isStreaming && !resistData && (
        <div className="no-data-message">
          Click "Start" to begin monitoring resistance data
        </div>
      )}
    </div>
  );
}
