import type { ReactNode } from "react";
import {
  IconFilmFill,
  IconGearshape,
  IconHouseFill,
  IconMusicNoteList,
  IconSparklesTvFill,
  IconTvFill,
} from "symbols-react";
import { type LibraryTab, type NavTabId, NAV_TABS, navigate } from "../router";

const ICON_FOR: Record<NavTabId, ReactNode> = {
  home: <IconHouseFill width={20} height={20} />,
  movies: <IconFilmFill width={20} height={20} />,
  shows: <IconSparklesTvFill width={20} height={20} />,
  music: <IconMusicNoteList width={20} height={20} />,
  live: <IconTvFill width={20} height={20} />,
  settings: <IconGearshape width={20} height={20} />,
};

function SideRail({
  activeTab,
  hiddenTabs,
  onSettings,
}: {
  activeTab: NavTabId | null;
  hiddenTabs: LibraryTab[];
  onSettings: () => void;
}) {
  const hidden = new Set<string>(hiddenTabs);
  const visible = NAV_TABS.filter((tab) => !hidden.has(tab.id));

  return (
    <aside className="side-rail glass-panel" aria-label="Primary">
      <div className="brand-mark">
        <span>G</span>
      </div>
      <nav className="nav-stack">
        {visible.map((tab) => (
          <button
            className={`icon-button ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => navigate(tab.path)}
            title={tab.label}
            aria-label={tab.label}
            type="button"
          >
            {ICON_FOR[tab.id]}
          </button>
        ))}
      </nav>
      <button
        className={`icon-button ${activeTab === "settings" ? "active" : ""}`}
        onClick={onSettings}
        title="Settings"
        aria-label="Settings"
        type="button"
      >
        {ICON_FOR.settings}
      </button>
    </aside>
  );
}

export default SideRail;
