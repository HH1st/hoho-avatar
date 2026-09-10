type StudioTheme = "morning" | "night";

const themeOptions = document.querySelectorAll<HTMLButtonElement>("[data-theme-option]");

function applyTheme(theme: StudioTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "morning" ? "light" : "dark";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content =
    theme === "morning" ? "#faf7f0" : "#101012";
  for (const option of themeOptions) {
    option.setAttribute("aria-pressed", String(option.dataset.themeOption === theme));
  }
}

// The head script already resolved URL, saved preference and system appearance.
applyTheme(document.documentElement.dataset.theme === "morning" ? "morning" : "night");

for (const option of themeOptions) {
  option.addEventListener("click", () => {
    const theme = option.dataset.themeOption === "morning" ? "morning" : "night";
    applyTheme(theme);
    try { localStorage.setItem("hoho-studio-theme", theme); } catch { /* Session-only in restricted browsers. */ }
    // Keep a shared theme link consistent with a subsequent manual selection.
    const url = new URL(location.href);
    if (url.searchParams.has("theme")) {
      url.searchParams.set("theme", theme);
      history.replaceState(history.state, "", url);
    }
  });
}
