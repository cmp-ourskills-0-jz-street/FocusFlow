"""
Emotions Controller for calculating relaxation/tension metrics
Based on the PyQt BrainBitDemo emotions implementation
"""
import logging
from typing import Callable, Optional, Dict, Any

logger = logging.getLogger(__name__)

HAS_EMOTIONS = False
EmotionalMath = None
MathLibSetting = None
ArtifactDetectSetting = None
MentalAndSpectralSetting = None
RawChannels = None

try:
    from em_st_artifacts.emotional_math import EmotionalMath
    from em_st_artifacts.utils.lib_settings import MathLibSetting, ArtifactDetectSetting, MentalAndSpectralSetting
    from em_st_artifacts.utils.support_classes import RawChannels
    HAS_EMOTIONS = True
except (ImportError, OSError) as e:
    logger.warning(f"em_st_artifacts not available ({e}). Using mock emotions for development.")
    HAS_EMOTIONS = False
    
    # Mock classes for development without emotions library
    import random
    import time
    
    # Artifact detection simulation probabilities
    # Reduced probabilities to allow calibration to complete successfully
    ARTIFACT_BOTH_SIDES_PROBABILITY = 0.01
    ARTIFACT_SEQUENCE_PROBABILITY = 0.005
    
    # Calibration settings
    MOCK_CALIBRATION_DURATION_SECONDS = 6
    
    class MockMentalData:
        def __init__(self):
            # Generate realistic relaxation/attention values (0.0 to 1.0)
            self.rel_relaxation = random.uniform(0.3, 0.9)
            self.rel_attention = random.uniform(0.3, 0.9)
            self.inst_relaxation = random.uniform(0.2, 1.0)
            self.inst_attention = random.uniform(0.2, 1.0)
    
    class MockEmotionalMath:
        def __init__(self, *args, **kwargs):
            self._calibration_progress = 0
            self._calibration_finished_flag = False
            self._is_calibrating = False
            self._start_time = None
        
        def set_calibration_length(self, length): pass
        def set_mental_estimation_mode(self, mode): pass
        def set_skip_wins_after_artifact(self, wins): pass
        def set_zero_spect_waves(self, *args): pass
        def set_spect_normalization_by_bands_width(self, mode): pass
        
        def start_calibration(self):
            self._is_calibrating = True
            self._calibration_finished_flag = False
            self._calibration_progress = 0
            self._start_time = time.time()
        
        def push_bipolars(self, data): pass
        
        def process_data_arr(self):
            # Simulate calibration progress
            if self._is_calibrating:
                elapsed = time.time() - self._start_time
                # Calibration duration from constant
                self._calibration_progress = min(100, int((elapsed / MOCK_CALIBRATION_DURATION_SECONDS) * 100))
                if self._calibration_progress >= 100:
                    self._calibration_finished_flag = True
                    self._is_calibrating = False
        
        def calibration_finished(self):
            return self._calibration_finished_flag
        
        def get_calibration_percents(self):
            return self._calibration_progress
        
        def is_both_sides_artifacted(self):
            # Randomly simulate artifacts using defined probability
            return random.random() < ARTIFACT_BOTH_SIDES_PROBABILITY
        
        def is_artifacted_sequence(self):
            # Rarely simulate artifact sequences using defined probability
            return random.random() < ARTIFACT_SEQUENCE_PROBABILITY
        
        def read_mental_data_arr(self):
            # Return mock mental data after calibration
            if self._calibration_finished_flag:
                return [MockMentalData()]
            return []
    
    EmotionalMath = MockEmotionalMath
    
    class MockRawChannels:
        def __init__(self, left, right):
            self.left = left
            self.right = right
    
    MathLibSetting = lambda **kwargs: None
    ArtifactDetectSetting = lambda **kwargs: None
    MentalAndSpectralSetting = lambda **kwargs: None
    RawChannels = MockRawChannels


class EmotionsController:
    """
    Controller for emotions/relaxation calculations using bipolar mode
    Calculates relaxation and attention metrics from EEG data
    """
    
    def __init__(self):
        # Initialize emotional math library with bipolar mode
        # Using settings similar to the PyQt demo implementation
        calibration_length = 6
        nwins_skip_after_artifact = 10
        
        if HAS_EMOTIONS:
            # Real implementation with actual em_st_artifacts library
            mls = MathLibSetting(
                sampling_rate=250,
                process_win_freq=25,
                n_first_sec_skipped=4,
                fft_window=1000,
                bipolar_mode=True,
                channels_number=4,
                channel_for_analysis=0
            )
            
            ads = ArtifactDetectSetting(
                art_bord=110,
                allowed_percent_artpoints=70,
                raw_betap_limit=800_000,
                global_artwin_sec=4,
                num_wins_for_quality_avg=125,
                hamming_win_spectrum=True,
                hanning_win_spectrum=False,
                total_pow_border=100,
                spect_art_by_totalp=True
            )
            
            mss = MentalAndSpectralSetting(
                n_sec_for_averaging=2,
                n_sec_for_instant_estimation=4
            )
            
            self._math = EmotionalMath(mls, ads, mss)
            self._math.set_calibration_length(calibration_length)
            self._math.set_mental_estimation_mode(False)
            self._math.set_skip_wins_after_artifact(nwins_skip_after_artifact)
            self._math.set_zero_spect_waves(True, 0, 1, 1, 1, 0)
            self._math.set_spect_normalization_by_bands_width(True)
        else:
            # Mock implementation for development
            logger.info("Using mock emotions controller")
            self._math = EmotionalMath()
        
        # Callbacks
        self.emotions_callback: Optional[Callable] = None
        self.calibration_callback: Optional[Callable] = None
        self._is_calibrating = False
    
    def is_available(self) -> bool:
        """Check if emotions library is available"""
        return self._math is not None
    
    def start_calibration(self):
        """Start emotions calibration process"""
        if not self.is_available():
            raise RuntimeError("Emotions library not available")
        
        self._math.start_calibration()
        self._is_calibrating = True
        logger.info("Started emotions calibration")
    
    def process_data(self, signal_data):
        """
        Process signal data and calculate emotions/relaxation metrics
        
        Args:
            signal_data: List of signal samples with O1, O2, T3, T4 values
        """
        if not self.is_available():
            return
        
        # Convert to bipolar channels (left and right)
        # Left: T3 - O1, Right: T4 - O2
        raw_channels = []
        for sample in signal_data:
            left_bipolar = sample.get('T3', 0) - sample.get('O1', 0)
            right_bipolar = sample.get('T4', 0) - sample.get('O2', 0)
            raw_channels.append(RawChannels(left_bipolar, right_bipolar))
        
        try:
            # Push data and process
            self._math.push_bipolars(raw_channels)
            self._math.process_data_arr()
            
            # Check artifacts
            is_both_sides_artifacted = self._math.is_both_sides_artifacted()
            is_sequence_artifacted = self._math.is_artifacted_sequence()
            
            # Check calibration status
            if self._is_calibrating and not self._math.calibration_finished():
                calibration_percent = self._math.get_calibration_percents()
                if self.calibration_callback:
                    # Only include artifact flags if they are actually True to avoid confusing users
                    callback_data = {'calibration_percent': calibration_percent}
                    if is_both_sides_artifacted:
                        callback_data['is_both_sides_artifacted'] = True
                    if is_sequence_artifacted:
                        callback_data['is_sequence_artifacted'] = True
                    self.calibration_callback(callback_data)
            elif self._math.calibration_finished():
                if self._is_calibrating:
                    self._is_calibrating = False
                    logger.info("Calibration finished")
                
                # Read mental data (relaxation/attention)
                mental_data = self._math.read_mental_data_arr()
                if len(mental_data) > 0 and self.emotions_callback:
                    # Get the latest mental data
                    data = mental_data[-1]
                    # Safely extract attributes with fallback values
                    emotions_result = {
                        'rel_relaxation': round(getattr(data, 'rel_relaxation', 0.0), 2),
                        'rel_attention': round(getattr(data, 'rel_attention', 0.0), 2),
                        'inst_relaxation': round(getattr(data, 'inst_relaxation', 0.0), 2),
                        'inst_attention': round(getattr(data, 'inst_attention', 0.0), 2),
                        'is_both_sides_artifacted': is_both_sides_artifacted,
                        'is_sequence_artifacted': is_sequence_artifacted
                    }
                    self.emotions_callback(emotions_result)
        
        except Exception as e:
            logger.error(f"Error processing emotions data: {e}")
    
    def set_emotions_callback(self, callback: Callable):
        """Set callback for emotions data"""
        self.emotions_callback = callback
    
    def set_calibration_callback(self, callback: Callable):
        """Set callback for calibration progress"""
        self.calibration_callback = callback
    
    def clear_callbacks(self):
        """Clear all callbacks"""
        self.emotions_callback = None
        self.calibration_callback = None
