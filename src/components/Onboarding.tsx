import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  JellyfinClient,
  type JellyfinPublicInfo,
  type JellyfinPublicUser,
} from "../jellyfin";
import { logger } from "../logger";
import UserPicker from "./UserPicker";

const log = logger.scope("onboarding");

/*
  First-run onboarding.

  Drives the user from "haven't seen Glassfin before" to "authenticated against
  their Jellyfin server with a working session". Steps:

    1. welcome     — brand intro, "Get started" / "Skip"
    2. server      — server URL entry + verify (/System/Info/Public)
    3. user        — user picker if /Users/Public returns; otherwise username form
    4. credentials — password entry (and username if no picker)
    5. done        — "you're set" + tips

  Persistence:
    - On successful sign-in, parent calls localStorage.setItem("glassfin.session", …)
      and "glassfin.onboardingComplete" = "true".
    - "Skip" only sets onboardingComplete=true and lets the user finish setup
      from Settings → Connection.
*/

export type OnboardingSession = {
  serverUrl: string;
  accessToken: string;
  userId: string;
  username: string;
};

type Step = "welcome" | "server" | "user" | "credentials" | "done";

type Props = {
  initialServerUrl: string;
  onComplete: (session: OnboardingSession) => void;
  onSkip: () => void;
};

export default function Onboarding({ initialServerUrl, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [serverInfo, setServerInfo] = useState<JellyfinPublicInfo | null>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "ok" | "error">("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [pickedUser, setPickedUser] = useState<JellyfinPublicUser | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [signInState, setSignInState] = useState<"idle" | "signing" | "error">("idle");
  const [signInError, setSignInError] = useState<string | null>(null);

  const [completedSession, setCompletedSession] = useState<OnboardingSession | null>(null);

  const serverInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the right field when the step changes.
  useEffect(() => {
    if (step === "server") serverInputRef.current?.focus();
    if (step === "credentials") {
      // If we don't have a picked user, focus the username field; otherwise password.
      if (pickedUser) passwordInputRef.current?.focus();
      else usernameInputRef.current?.focus();
    }
    if (step === "done") doneButtonRef.current?.focus();
  }, [step, pickedUser]);

  const progressIndex = useMemo(() => {
    switch (step) {
      case "welcome":
        return 0;
      case "server":
        return 1;
      case "user":
        return 2;
      case "credentials":
        return 3;
      case "done":
        return 4;
      default:
        return 0;
    }
  }, [step]);

  async function verifyServer() {
    const trimmed = serverUrl.trim();
    if (!trimmed) {
      setVerifyError("Enter your Jellyfin server URL.");
      setVerifyState("error");
      return;
    }
    // Coerce the http:// prefix if missing — easy mistake to make.
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    setServerUrl(normalized);

    log.info("Verifying server", { serverUrl: normalized });
    setVerifyState("verifying");
    setVerifyError(null);

    try {
      const client = new JellyfinClient({ serverUrl: normalized });
      const info = await client.getPublicInfo();
      log.info("Server verified", info);
      setServerInfo(info);
      setVerifyState("ok");
      setStep("user");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not reach the server.";
      log.error("Server verification failed", error);
      setVerifyError(
        msg.includes("Failed to fetch") || msg.includes("NetworkError")
          ? `Could not reach ${normalized}. Check that the server is running and reachable from this browser. CORS must allow the page origin if it differs from the Jellyfin host.`
          : msg,
      );
      setVerifyState("error");
    }
  }

  function handleUserPicked(user: JellyfinPublicUser) {
    log.info("User picked from picker", { name: user.Name, hasPassword: user.HasPassword });
    setPickedUser(user);
    setUsernameInput(user.Name);
    if (user.HasPassword === false) {
      // Open user — sign in immediately, no password step.
      void doSignIn(user.Name, "");
    } else {
      setStep("credentials");
    }
  }

  function handleManualUserStep() {
    setPickedUser(null);
    setUsernameInput("");
    setStep("credentials");
  }

  async function doSignIn(name: string, pw: string) {
    log.info("Sign-in started", { server: serverUrl, username: name });
    setSignInState("signing");
    setSignInError(null);

    try {
      const client = new JellyfinClient({ serverUrl });
      const auth = await client.authenticateByName(name, pw);
      log.info("Authentication ok", { userId: auth.User.Id, name: auth.User.Name });

      const session: OnboardingSession = {
        serverUrl,
        accessToken: auth.AccessToken,
        userId: auth.User.Id,
        username: auth.User.Name,
      };
      setCompletedSession(session);
      setSignInState("idle");
      setStep("done");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sign-in failed.";
      log.error("Sign-in failed", error);
      setSignInError(msg);
      setSignInState("error");
    }
  }

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = pickedUser?.Name ?? usernameInput.trim();
    if (!name) {
      setSignInError("Enter a username.");
      setSignInState("error");
      return;
    }
    void doSignIn(name, password);
  }

  function handleFinish() {
    if (!completedSession) return;
    onComplete(completedSession);
  }

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Glassfin">
      <motion.div
        className="onboarding-card glass-panel"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
      >
        <header className="onboarding-header">
          <div className="onboarding-brand">
            <span className="onboarding-brand-mark" aria-hidden="true">G</span>
            <strong>Glassfin</strong>
          </div>
          <ol className="onboarding-progress" aria-label="Setup progress">
            {(["welcome", "server", "user", "credentials", "done"] as Step[]).map((s, i) => (
              <li
                key={s}
                aria-current={step === s ? "step" : undefined}
                className={i <= progressIndex ? "is-active" : ""}
              />
            ))}
          </ol>
        </header>

        <main className="onboarding-step">
          {step === "welcome" && (
            <div className="onboarding-step-body">
              <h1>Welcome.</h1>
              <p>
                Glassfin is a fast, glassy browser client for your Jellyfin server. Setup takes
                under a minute — we just need your server address and login.
              </p>
              <ul className="onboarding-feature-list">
                <li>Streams directly from your server, nothing in the middle</li>
                <li>Resume rail, library browsing, IMDb / TMDB / TVDB deep-links</li>
                <li>TV / remote-friendly with arrow-key navigation</li>
              </ul>
            </div>
          )}

          {step === "server" && (
            <div className="onboarding-step-body">
              <h1>Where's your server?</h1>
              <p>
                Paste the same URL you use to reach Jellyfin in your browser. Local network is
                fine — for example <code>http://192.168.1.6:8096</code>.
              </p>
              <label className="onboarding-field">
                <span>Server URL</span>
                <input
                  ref={serverInputRef}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="http://jellyfin.local:8096"
                  value={serverUrl}
                  onChange={(e) => {
                    setServerUrl(e.target.value);
                    if (verifyState !== "idle") setVerifyState("idle");
                    setVerifyError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void verifyServer();
                    }
                  }}
                />
              </label>
              {verifyState === "ok" && serverInfo && (
                <p className="onboarding-success">
                  Connected to {serverInfo.ServerName ?? "Jellyfin"}{" "}
                  {serverInfo.Version ? `· ${serverInfo.Version}` : ""}
                </p>
              )}
              {verifyError && <p className="onboarding-error" role="alert">{verifyError}</p>}
            </div>
          )}

          {step === "user" && (
            <div className="onboarding-step-body">
              <h1>Pick your profile.</h1>
              <p>
                {serverInfo?.ServerName
                  ? `Found ${serverInfo.ServerName}. `
                  : ""}
                Choose a public user to sign in, or sign in by name if your server hides them.
              </p>
              <UserPicker
                serverUrl={serverUrl}
                onPick={handleUserPicked}
                onError={(msg) => log.warn("User discovery failed", msg)}
                autoDiscover
              />
              <button className="text-button" type="button" onClick={handleManualUserStep}>
                Sign in by name instead
              </button>
            </div>
          )}

          {step === "credentials" && (
            <form className="onboarding-step-body" onSubmit={handleCredentialsSubmit}>
              <h1>{pickedUser ? `Hi, ${pickedUser.Name}.` : "Sign in by name."}</h1>
              <p>
                {pickedUser
                  ? "Enter your password to finish."
                  : "Enter the username and password you use on Jellyfin."}
              </p>
              {!pickedUser && (
                <label className="onboarding-field">
                  <span>Username</span>
                  <input
                    ref={usernameInputRef}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                  />
                </label>
              )}
              <label className="onboarding-field">
                <span>Password</span>
                <input
                  ref={passwordInputRef}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {signInError && <p className="onboarding-error" role="alert">{signInError}</p>}
              {/* Hidden submit so Enter advances the form. */}
              <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            </form>
          )}

          {step === "done" && (
            <div className="onboarding-step-body">
              <h1>You're all set.</h1>
              <p>
                Signed in as <strong>{completedSession?.username}</strong>. Your library will
                start syncing in a moment.
              </p>
              <ul className="onboarding-feature-list">
                <li>Watch sync progress in the floating panel at bottom-left.</li>
                <li>If anything misbehaves, open <strong>Settings → Logs</strong>.</li>
                <li>Use arrow keys / a remote to navigate posters and rails.</li>
              </ul>
            </div>
          )}
        </main>

        <footer className="onboarding-actions">
          {step === "welcome" && (
            <>
              <button type="button" className="text-button" onClick={onSkip}>
                Skip for now
              </button>
              <button type="button" className="primary-button" onClick={() => setStep("server")}>
                Get started
              </button>
            </>
          )}
          {step === "server" && (
            <>
              <button type="button" className="text-button" onClick={() => setStep("welcome")}>
                Back
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void verifyServer()}
                disabled={verifyState === "verifying" || !serverUrl.trim()}
              >
                {verifyState === "verifying" ? "Verifying…" : "Verify and continue"}
              </button>
            </>
          )}
          {step === "user" && (
            <>
              <button type="button" className="text-button" onClick={() => setStep("server")}>
                Back
              </button>
              <span aria-hidden="true" />
            </>
          )}
          {step === "credentials" && (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSignInError(null);
                  setSignInState("idle");
                  setStep("user");
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const name = pickedUser?.Name ?? usernameInput.trim();
                  if (!name) {
                    setSignInError("Enter a username.");
                    setSignInState("error");
                    return;
                  }
                  void doSignIn(name, password);
                }}
                disabled={signInState === "signing"}
              >
                {signInState === "signing" ? "Signing in…" : "Sign in"}
              </button>
            </>
          )}
          {step === "done" && (
            <>
              <span aria-hidden="true" />
              <button
                ref={doneButtonRef}
                type="button"
                className="primary-button"
                onClick={handleFinish}
              >
                Open dashboard
              </button>
            </>
          )}
        </footer>
      </motion.div>
    </div>
  );
}
