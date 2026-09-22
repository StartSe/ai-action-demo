"use client";
/* eslint-disable @next/next/no-img-element -- Local uploads and generated media. */
import { useEffect, useRef, useState } from "react";
import type { Asset } from "@/lib/flow/model";

export type MediaAsset = Pick<Asset, "url" | "title" | "kind">;

export default function FlowPreview({
  asset,
  autoPlay = false,
  interactive = true,
}: {
  asset?: MediaAsset;
  autoPlay?: boolean;
  interactive?: boolean;
}) {
  // A new asset mounts a fresh player, resetting loading and playback state.
  return asset ? (
    <Media
      key={asset.url}
      asset={asset}
      autoPlay={autoPlay}
      interactive={interactive}
    />
  ) : (
    <div className="cf-empty-media">
      <span>✧</span>
      <small>Sua próxima criação começa aqui</small>
    </div>
  );
}
function Media({
  asset,
  autoPlay,
  interactive,
}: {
  asset: MediaAsset;
  autoPlay: boolean;
  interactive: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = video.current;
    if (!media || !autoPlay) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (preference.matches) media.pause();
      else void media.play().catch(() => {});
    };
    apply();
    preference.addEventListener("change", apply);
    return () => preference.removeEventListener("change", apply);
  }, [autoPlay, attempt]);
  return (
    <div
      className="cf-media nodrag nopan nowheel"
      aria-busy={!ready && !failed}
    >
      {failed ? (
        <div className="cf-media-failed" role="status">
          <span>Não foi possível carregar a prévia.</span>
          {interactive && (
            <>
              <button
                onClick={() => {
                  setFailed(false);
                  setReady(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Recarregar prévia
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {!ready && (
            <span
              className="cf-media-loading skeleton"
              role="status"
              aria-label="Carregando prévia"
            />
          )}
          {asset.kind === "video" ? (
            <video
              key={attempt}
              ref={video}
              aria-label={asset.title}
              controls={interactive}
              autoPlay={autoPlay}
              loop={autoPlay}
              muted={autoPlay}
              playsInline
              src={asset.url}
              preload="metadata"
              onLoadedMetadata={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          ) : (
            <img
              key={attempt}
              src={asset.url}
              alt={asset.title}
              onLoad={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          )}
        </>
      )}
    </div>
  );
}
