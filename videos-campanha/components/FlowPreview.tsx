"use client";
/* eslint-disable @next/next/no-img-element -- Local uploads and generated media. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Asset } from "@/lib/flow/model";
import { FlowDialog } from "./FlowFeedback";
import FlowIcon from "./FlowIcon";

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
  const [expanded, setExpanded] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (expanded || !autoPlay || preference.matches) media.pause();
      else void media.play().catch(() => {});
    };
    apply();
    preference.addEventListener("change", apply);
    return () => preference.removeEventListener("change", apply);
  }, [autoPlay, attempt, expanded]);
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
              aria-hidden="true"
              tabIndex={-1}
              autoPlay={autoPlay && !expanded}
              loop={autoPlay}
              muted
              playsInline
              src={asset.url}
              preload="metadata"
              onLoadedMetadata={(e) => {
                setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth);
                setReady(true);
              }}
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
          {ready && interactive && (
            <button
              type="button"
              className={`cf-image-expand nodrag nopan${asset.kind === "video" ? " cf-video-expand" : ""}`}
              aria-label={`${asset.kind === "video" ? "Ver vídeo inteiro" : "Ver imagem inteira"}: ${asset.title}`}
              aria-haspopup="dialog"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
            >
              {asset.kind === "video" ? <span className="cf-video-play"><FlowIcon name="video" />Assistir vídeo</span> : <><FlowIcon name="expand" />Ver inteira</>}
            </button>
          )}
          {expanded &&
            createPortal(
              <ExpandedMedia
                asset={asset}
                portrait={portrait}
                onClose={() => setExpanded(false)}
              />,
              document.body,
            )}
        </>
      )}
    </div>
  );
}

function ExpandedMedia({
  asset,
  portrait,
  onClose,
}: {
  asset: MediaAsset;
  portrait: boolean;
  onClose: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = player.current;
    if (!media) return;
    void media.play().catch(() => {});
    return () => media.pause();
  }, []);
  const isVideo = asset.kind === "video";
  return (
    <FlowDialog
      title={`${isVideo ? "Vídeo inteiro" : "Imagem inteira"}: ${asset.title}`}
      className={`cf-image-viewer${isVideo && portrait ? " cf-video-viewer-portrait" : ""}`}
      onClose={onClose}
      dismissOnBackdrop
    >
      <header>
        <h2>{asset.title}</h2>
        <button type="button" onClick={onClose} aria-label={isVideo ? "Fechar vídeo" : "Fechar imagem"}>
          <FlowIcon name="close" />
        </button>
      </header>
      <div className="cf-image-viewer-media">
        {failed ? (
          <p role="alert">
            Não foi possível carregar {isVideo ? "o vídeo" : "a imagem"}. Feche e tente novamente.
          </p>
        ) : isVideo ? (
          <video
            ref={player}
            src={asset.url}
            aria-label={asset.title}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={asset.url}
            alt={asset.title}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </FlowDialog>
  );
}
