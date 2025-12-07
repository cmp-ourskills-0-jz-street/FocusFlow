import { useState, useEffect } from 'react';
import { ApiService } from '../services/api';
import { wsService, MessageHandler } from '../services/websocket';
import type { EmotionsData, WebSocketMessage } from '../types';

// Relaxation level configuration
const RELAXATION_CONFIG = {
  tension: { threshold: 0.3, label: 'Напряжен', color: '#ff4444' },
  normal: { threshold: 0.7, label: 'Норма', color: '#ffaa00' },
  relaxed: { label: 'Расслаблен', color: '#44ff44' }
} as const;

export function EmotionsViewer() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [emotionsData, setEmotionsData] = useState<EmotionsData | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);

  useEffect(() => {
    const handler: MessageHandler = (message: WebSocketMessage) => {
      if (message.type === 'emotions') {
        const data = message.data as EmotionsData;
        setEmotionsData(data);
        
        // Check if calibrating
        if (data.calibration_percent !== undefined) {
          setIsCalibrating(true);
        } else if (data.rel_relaxation !== undefined || data.rel_attention !== undefined) {
          setIsCalibrating(false);
        }
      }
    };

    wsService.addMessageHandler(handler);
    return () => wsService.removeMessageHandler(handler);
  }, []);

  const handleStartStop = async () => {
    try {
      if (isStreaming) {
        await ApiService.stopDataStream('emotions');
        setIsStreaming(false);
        setEmotionsData(null);
        setIsCalibrating(false);
      } else {
        await ApiService.startDataStream('emotions');
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Error toggling emotions stream:', err);
    }
  };

  const getRelaxationLevel = (value?: number): string => {
    if (value === undefined) return 'N/A';
    if (value < RELAXATION_CONFIG.tension.threshold) return RELAXATION_CONFIG.tension.label;
    if (value < RELAXATION_CONFIG.normal.threshold) return RELAXATION_CONFIG.normal.label;
    return RELAXATION_CONFIG.relaxed.label;
  };

  const getRelaxationColor = (value?: number): string => {
    if (value === undefined) return '#666';
    if (value < RELAXATION_CONFIG.tension.threshold) return RELAXATION_CONFIG.tension.color;
    if (value < RELAXATION_CONFIG.normal.threshold) return RELAXATION_CONFIG.normal.color;
    return RELAXATION_CONFIG.relaxed.color;
  };

  return (
    <div className="emotions-viewer">
      <div className="header">
        <h3>Эмоции и Расслабленность</h3>
        <button onClick={handleStartStop} className="btn btn-primary">
          {isStreaming ? 'Стоп' : 'Старт'}
        </button>
      </div>

      {isCalibrating && emotionsData?.calibration_percent !== undefined && (
        <div className="calibration-status">
          <h4>Калибровка...</h4>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${emotionsData.calibration_percent}%` }}
            />
          </div>
          <p>{emotionsData.calibration_percent?.toFixed(0) ?? '0'}%</p>
          {emotionsData.is_both_sides_artifacted && (
            <p className="warning">⚠️ Артефакты с обеих сторон</p>
          )}
          {emotionsData.is_sequence_artifacted && (
            <p className="warning">⚠️ Последовательность с артефактами</p>
          )}
        </div>
      )}

      {!isCalibrating && emotionsData && (
        <div className="emotions-data">
          <div className="metric-card relaxation">
            <h4>Расслабленность</h4>
            <div 
              className="metric-value large" 
              style={{ color: getRelaxationColor(emotionsData.rel_relaxation) }}
            >
              {emotionsData.rel_relaxation !== undefined 
                ? (emotionsData.rel_relaxation * 10).toFixed(1)
                : 'N/A'}
            </div>
            <div className="metric-label">
              {getRelaxationLevel(emotionsData.rel_relaxation)}
            </div>
            <div className="metric-secondary">
              Мгновенная: {emotionsData.inst_relaxation !== undefined 
                ? emotionsData.inst_relaxation.toFixed(2)
                : 'N/A'}
            </div>
          </div>

          <div className="metric-card attention">
            <h4>Внимание</h4>
            <div className="metric-value large">
              {emotionsData.rel_attention !== undefined 
                ? (emotionsData.rel_attention * 10).toFixed(1)
                : 'N/A'}
            </div>
            <div className="metric-secondary">
              Мгновенное: {emotionsData.inst_attention !== undefined 
                ? emotionsData.inst_attention.toFixed(2)
                : 'N/A'}
            </div>
          </div>

          {(emotionsData.is_both_sides_artifacted || emotionsData.is_sequence_artifacted) && (
            <div className="artifacts-warning">
              {emotionsData.is_both_sides_artifacted && (
                <p>⚠️ Артефакты с обеих сторон</p>
              )}
              {emotionsData.is_sequence_artifacted && (
                <p>⚠️ Последовательность с артефактами</p>
              )}
            </div>
          )}
        </div>
      )}

      {!isStreaming && (
        <div className="placeholder">
          <p>Нажмите "Старт" для начала анализа эмоций</p>
          <p className="note">Калибровка займет около 6 секунд</p>
        </div>
      )}
    </div>
  );
}
