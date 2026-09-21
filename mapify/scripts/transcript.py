"""Public captions only. No cookies, login or private video access."""
import json
import os
import sys

try:
    # Imports are inside the error boundary so a missing dependency is not
    # incorrectly reported as unavailable captions by the application.
    from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound
    from youtube_transcript_api.proxies import GenericProxyConfig
    from requests import Session

    class TimedSession(Session):
        def request(self, *args, **kwargs):
            kwargs.setdefault('timeout', (8, 12))
            return super().request(*args, **kwargs)

    proxy = os.environ.get('YOUTUBE_PROXY_URL')
    api = YouTubeTranscriptApi(
        http_client=TimedSession(),
        proxy_config=GenericProxyConfig(http_url=proxy, https_url=proxy) if proxy else None,
    )
    tracks = api.list(sys.argv[1])
    try:
        track = tracks.find_transcript(['pt', 'pt-BR', 'en', 'en-US', 'es'])
    except NoTranscriptFound:
        track = next(iter(tracks))
    data = track.fetch()
    print(json.dumps({'segments': data.to_raw_data(), 'language': data.language}, ensure_ascii=False))
except Exception as error:
    # Never include provider responses or proxy credentials in application errors.
    print(json.dumps({'error': type(error).__name__}))
    sys.exit(1)
