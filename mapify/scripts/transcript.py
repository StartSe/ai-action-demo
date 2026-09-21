"""Public captions only. No cookies, login or private video access."""
import json
import os
import sys
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig

try:
    proxy = os.environ.get('YOUTUBE_PROXY_URL')
    api = YouTubeTranscriptApi(proxy_config=GenericProxyConfig(http_url=proxy, https_url=proxy)) if proxy else YouTubeTranscriptApi()
    tracks = api.list(sys.argv[1])
    try:
        track = tracks.find_transcript(['pt', 'pt-BR', 'en', 'en-US', 'es'])
    except Exception:
        track = next(iter(tracks))
    data = track.fetch()
    print(json.dumps({'segments': data.to_raw_data(), 'language': data.language}, ensure_ascii=False))
except Exception as error:
    # Never include provider responses or proxy credentials in application errors.
    print(json.dumps({'error': type(error).__name__}))
    sys.exit(1)
