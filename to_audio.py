import av
import os
import whisper

def convert_video_to_audio_pyav(video_path, audio_path):
    if not os.path.exists(video_path):
        print(f"Файл {video_path} не найден!")
        return False
    try:
        container = av.open(video_path)
        
        audio_stream = None
        for stream in container.streams.audio:
            audio_stream = stream
            break
        
        if audio_stream is None:
            print("✗ В видео нет аудио дорожки")
            return False
        
        output_container = av.open(audio_path, 'w')
        output_stream = output_container.add_stream('mp3', rate=44100)
        
        for packet in container.demux(audio_stream):
            for frame in packet.decode():
                frame.pts = None
                for packet_out in output_stream.encode(frame):
                    output_container.mux(packet_out)
        
        for packet_out in output_stream.encode(None):
            output_container.mux(packet_out)
        
        output_container.close()
        container.close()
        
        print(f"✓ Аудио сохранено: {audio_path}")
        return True
        
    except Exception as e:
        print(f"✗ Ошибка: {e}")
        return False


convert_video_to_audio_pyav("video.mp4", "audio.mp3")

model = whisper.load_model("turbo")
result = model.transcribe("video_audio.mp3")
print(result)