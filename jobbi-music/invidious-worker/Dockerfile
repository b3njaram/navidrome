FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir yt-dlp
WORKDIR /worker
COPY app.py /worker/app.py
USER 1000:100
EXPOSE 8091
CMD ["python","-u","/worker/app.py"]
