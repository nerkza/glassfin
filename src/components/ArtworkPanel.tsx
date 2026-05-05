import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { IconArrowUpToLine, IconCheckmarkCircleFill, IconXmark } from "symbols-react";
import { type JellyfinClient, type JellyfinRemoteImage } from "../jellyfin";

/*
  Artwork override panel.

  Two paths:
  1. Pick from remote candidates (Jellyfin's RemoteImages endpoint, which is
     populated by configured providers — TMDB, fanart.tv, TheTVDB, etc.).
  2. Upload a custom file from the local machine.

  Both paths route through the Jellyfin server — the browser doesn't talk to
  TMDB/IMDB/etc. directly. That keeps the model: "Jellyfin owns metadata."
*/
function ArtworkPanel({
  client,
  itemId,
  onClose,
  onSaved,
}: {
  client: JellyfinClient;
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [candidates, setCandidates] = useState<JellyfinRemoteImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .getRemoteImages(itemId, "Primary")
      .then((images) => {
        if (!cancelled) {
          setCandidates(images);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load remote images");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, itemId]);

  async function pickRemote(image: JellyfinRemoteImage) {
    setBusy(true);
    setError(null);
    try {
      await client.downloadRemoteImage(itemId, image.Url, "Primary");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set artwork");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      await client.uploadImage(itemId, file, "Primary");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="detail-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className="detail-sheet glass-panel"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: "spring", stiffness: 140, damping: 20 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Override artwork"
      >
        <button className="close-button" onClick={onClose} type="button" aria-label="Close artwork picker">
          <IconXmark width={16} height={16} />
        </button>

        <div className="detail-body" style={{ paddingTop: 56 }}>
          <div>
            <span className="eyebrow">Artwork</span>
            <h2 style={{ marginTop: 6 }}>Override poster</h2>
            <p style={{ marginTop: 8 }}>
              Pick a candidate from your Jellyfin metadata providers, or upload your own.
            </p>
          </div>

          <div className="detail-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <IconArrowUpToLine width={16} height={16} />
              Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>

          {error && (
            <div className="server-card error">
              <span>Error</span>
              <strong>{error}</strong>
            </div>
          )}

          {loading ? (
            <div className="empty-state">
              <strong>Loading candidates…</strong>
              <p>Querying Jellyfin metadata providers.</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">
              <strong>No remote images found.</strong>
              <p>
                Your Jellyfin server has no image providers configured for this item, or none returned a
                match. You can still upload a custom file above.
              </p>
            </div>
          ) : (
            <div className="artwork-grid" role="list">
              {candidates.map((image, index) => (
                <button
                  key={`${image.Url}-${index}`}
                  className="artwork-tile"
                  type="button"
                  onClick={() => pickRemote(image)}
                  disabled={busy}
                  aria-label={`Use ${image.ProviderName} artwork`}
                >
                  <img src={image.ThumbnailUrl || image.Url} alt="" loading="lazy" />
                  <div className="artwork-tile-meta">
                    <span>{image.ProviderName}</span>
                    {image.Width && image.Height && (
                      <small>
                        {image.Width}×{image.Height}
                      </small>
                    )}
                  </div>
                  {busy && <IconCheckmarkCircleFill width={20} height={20} className="artwork-tile-check" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

export default ArtworkPanel;
