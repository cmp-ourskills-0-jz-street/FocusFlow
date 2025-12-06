import av
import os
import whisper
import yt_dlp
import sys

def download_youtube_video(url, output_filename="video.mp4"):
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': output_filename,
        'overwrites': True,
        'quiet': True, # Меньше мусора в консоли
        'no_warnings': True,
    }
    print(f"⬇️ Начинаю скачивание: {url}")
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        print(f"✅ Видео скачано: {output_filename}")
        return True
    except Exception as e:
        print(f"❌ Ошибка скачивания: {e}")
        return False

def convert_video_to_audio_pyav(video_path, audio_path):
    if not os.path.exists(video_path):
        print(f"Файл {video_path} не найден!")
        return False
    try:
        container = av.open(video_path)
        audio_stream = next((s for s in container.streams.audio), None)
        if audio_stream is None:
                    print("❌ В видео нет аудио дорожки")
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
        print(f"✅ Аудио извлечено: {audio_path}")
        return True
    except Exception as e:
        print(f"❌ Ошибка конвертации: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ Ошибка: Укажите ссылку на видео как аргумент.")
        print("Пример: python3 main.py \"https://www.youtube.com/watch?v=...\"")
        sys.exit(1)
    youtube_url = sys.argv[1]
    
    video_filename = "video.mp4"
    audio_filename = "audio.mp3"

    if download_youtube_video(youtube_url, video_filename):
        if convert_video_to_audio_pyav(video_filename, audio_filename):
            print("🧠 Загружаю модель Whisper...")
            try:
                model = whisper.load_model("small")
                print("📝 Начинаю транскрибацию...")
                result = model.transcribe(audio_filename)

                print("\n" + "="*30)
                print("РЕЗУЛЬТАТ:")
                print("="*30)
                print(result["text"])

                with open("result.txt", "w", encoding="utf-8") as f:
                    f.write(result["text"])
                print(f"\n💾 Текст сохранен в файл result.txt")

            except Exception as e:
                print(f"❌ Ошибка Whisper: {e}")
